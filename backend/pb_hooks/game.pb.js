// backend/pb_hooks/game.pb.js
// Sanasaaga Game API endpoints

routerAdd("GET", "/health", (e) => {
    return e.json(200, {
        status: "ok",
        app: "Sanasaaga",
        version: "2.1.0-pocketbase"
    });
});

// Start or resume a game.
//   Daily mode: one word per Helsinki day, same for everyone, random length
//   (4-8) and word class. In-progress daily games are resumed across the
//   midnight rollover (the server returns day_changed=true). Free play keeps
//   the client-selected length/category.
routerAdd("POST", "/api/game/new", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const body = e.requestInfo().body || {};
    const mode = body.mode || "random";
    const today = engine.getFinlandDateStr();

    // ---- Daily challenge ----
    if (mode === "daily") {
        // 1) Explicit resume by session_id (guests track this in localStorage; authed
        //    clients may also send it). Lets an in-progress game survive reloads and
        //    the midnight rollover.
        if (body.session_id) {
            try {
                const rec = e.app.findFirstRecordByFilter(
                    "games",
                    "session_id = {:sid} && mode = 'daily'",
                    { sid: body.session_id }
                );
                if (!rec.get("finished")) {
                    // Resume only the owner's game, or an unowned (guest) game.
                    if (engine.canAccessGame(rec.get("user"), e.auth ? e.auth.id : null)) {
                        return e.json(200, engine.serializeGame(rec, rec.get("date_str") !== today));
                    }
                }
            } catch (err) {
                // session not found / invalid -> fall through to normal logic
            }
        }

        // 2) Authed users: resume by user. Today's game first, then an unfinished
        //    daily game from an earlier date (the rollover case).
        if (e.auth) {
            try {
                const todayGame = e.app.findFirstRecordByFilter(
                    "games",
                    "user = {:uid} && mode = 'daily' && date_str = {:d}",
                    { uid: e.auth.id, d: today }
                );
                return e.json(200, engine.serializeGame(todayGame, false));
            } catch (err) {
                // no today's game yet
            }

            try {
                const prev = e.app.findRecordsByFilter(
                    "games",
                    "user = {:uid} && mode = 'daily' && finished = false && date_str < {:d}",
                    "-date_str",
                    1,
                    0,
                    { uid: e.auth.id, d: today }
                );
                if (prev.length > 0) {
                    return e.json(200, engine.serializeGame(prev[0], true));
                }
            } catch (err) {
                // ignore lookup errors
            }
        }

        // 3) Otherwise create today's new daily game.
        const targetObj = engine.pickDailyTarget(today);
        return e.json(200, engine.createDailyGame(e.app, e.auth ? e.auth.id : null, today, targetObj));
    }

    // ---- Free play (random) ----
    // Free games persist until finished. Each length (4-8) is an independent
    // slot, so switching length or toggling daily<->free resumes the existing
    // in-progress game for that length instead of discarding it.
    const length = Number(body.length) || 5;
    if (length < 4 || length > 8) {
        return e.json(400, { error: "Sanan pituuden on oltava 4-8 kirjainta." });
    }
    const category = body.category || "all";

    // 1) Explicit resume by session_id (tracked per-slot in the client's
    //    localStorage). Must be a random game of the SAME length, unfinished,
    //    and accessible by this caller.
    if (body.session_id) {
        try {
            const rec = e.app.findFirstRecordByFilter(
                "games",
                "session_id = {:sid} && mode = 'random'",
                { sid: body.session_id }
            );
            if (!rec.get("finished")
                && rec.get("length") === length
                && engine.canAccessGame(rec.get("user"), e.auth ? e.auth.id : null)) {
                return e.json(200, engine.serializeGame(rec, false));
            }
        } catch (err) {
            // not found / invalid -> fall through
        }
    }

    // 2) Authed users: resume their most recent unfinished random game of this
    //    length (lets them continue on a new device/browser without the map).
    if (e.auth) {
        try {
            const prev = e.app.findRecordsByFilter(
                "games",
                "user = {:uid} && mode = 'random' && length = {:len} && finished = false",
                "-created",
                1,
                0,
                { uid: e.auth.id, len: length }
            );
            if (prev.length > 0) {
                return e.json(200, engine.serializeGame(prev[0], false));
            }
        } catch (err) {
            // ignore lookup errors
        }
    }

    // 3) Otherwise create a new free game for this length.
    const targetObj = engine.pickRandomTarget(length, category);
    return e.json(200, engine.createRandomGame(e.app, e.auth ? e.auth.id : null, today, length, category, targetObj));
});

// Reset a free-play game: discard the current unfinished game of a given length
// and start a fresh one. Free play is casual and unlimited, so a discarded game
// is deleted (not recorded as a loss) and never affects stats. Daily games
// cannot be reset here - they use /api/game/daily/abandon.
routerAdd("POST", "/api/game/random/reset", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const body = e.requestInfo().body || {};
    const today = engine.getFinlandDateStr();

    const length = Number(body.length) || 5;
    if (length < 4 || length > 8) {
        return e.json(400, { error: "Sanan pituuden on oltava 4-8 kirjainta." });
    }
    const category = body.category || "all";
    const sessionId = (body.session_id || "").trim();

    // Delete the caller's current unfinished game for this slot, if provided.
    if (sessionId) {
        try {
            const rec = e.app.findFirstRecordByFilter(
                "games",
                "session_id = {:sid} && mode = 'random'",
                { sid: sessionId }
            );
            if (!engine.canAccessGame(rec.get("user"), e.auth ? e.auth.id : null)) {
                return e.json(403, { error: "Ei oikeutta tähän peliin." });
            }
            if (!rec.get("finished")) {
                e.app.delete(rec);
            }
        } catch (err) {
            // nothing to discard
        }
    }

    const targetObj = engine.pickRandomTarget(length, category);
    return e.json(200, engine.createRandomGame(e.app, e.auth ? e.auth.id : null, today, length, category, targetObj));
});

// Give up the in-progress daily game from a previous day and start today's.
// The abandoned game is recorded as a loss (finished, won=false).
routerAdd("POST", "/api/game/daily/abandon", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const body = e.requestInfo().body || {};
    const today = engine.getFinlandDateStr();

    const sessionId = (body.session_id || "").trim();
    if (!sessionId) {
        return e.json(400, { error: "session_id is required." });
    }

    let rec;
    try {
        rec = e.app.findFirstRecordByFilter("games", "session_id = {:sid} && mode = 'daily'", { sid: sessionId });
    } catch (err) {
        return e.json(404, { error: "Pelisessiota ei löytynyt." });
    }

    if (rec.get("finished")) {
        return e.json(400, { error: "Peli on jo päättynyt." });
    }

    // Ownership: only the owner (or nobody, for guest games) may give up a game.
    if (!engine.canAccessGame(rec.get("user"), e.auth ? e.auth.id : null)) {
        return e.json(403, { error: "Ei oikeutta tähän peliin." });
    }

    // Only a game from an earlier Helsinki day may be given up, otherwise this
    // endpoint would hand out today's secret word.
    if (!engine.isAbandonable(rec.get("date_str"), today)) {
        return e.json(400, { error: "Vain edellisen päivän pelin voi jättää kesken." });
    }

    // Record the abandoned game as a loss.
    rec.set("finished", true);
    rec.set("won", false);
    e.app.save(rec);

    // Return today's daily game if one already exists (authed), else create it.
    if (e.auth) {
        try {
            const todayGame = e.app.findFirstRecordByFilter(
                "games",
                "user = {:uid} && mode = 'daily' && date_str = {:d}",
                { uid: e.auth.id, d: today }
            );
            return e.json(200, engine.serializeGame(todayGame, false));
        } catch (err) {
            // none yet
        }
    }

    const targetObj = engine.pickDailyTarget(today);
    return e.json(200, engine.createDailyGame(e.app, e.auth ? e.auth.id : null, today, targetObj));
});

routerAdd("POST", "/api/game/guess", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const body = e.requestInfo().body || {};

    const sessionId = (body.session_id || "").trim();
    const guess = (body.guess || "").trim().toLowerCase();

    if (!sessionId) {
        return e.json(400, { error: "session_id is required." });
    }
    if (!guess) {
        return e.json(400, { error: "guess is required." });
    }

    let rec;
    try {
        rec = e.app.findFirstRecordByFilter("games", "session_id = {:sid}", { sid: sessionId });
    } catch (err) {
        return e.json(404, { error: "Pelisessiota ei löytynyt. Aloita uusi peli." });
    }

    if (rec.get("finished")) {
        return e.json(400, { error: "Peli on jo päättynyt." });
    }

    // Ownership: only the owner (or nobody, for guest games) may play a game.
    if (!engine.canAccessGame(rec.get("user"), e.auth ? e.auth.id : null)) {
        return e.json(403, { error: "Ei oikeutta tähän peliin." });
    }

    const length = rec.get("length");
    const secret = rec.get("secret");

    if (guess.length !== length) {
        return e.json(400, { error: "Sanan on oltava " + length + " kirjainta pitkä." });
    }

    // Check against Finnish dictionary
    if (!engine.isValidGuess(guess, length)) {
        return e.json(200, {
            valid: false,
            error: "Sanaa ei löydy suomen kielen sanakirjasta.",
            guess: guess
        });
    }

    const evaluation = engine.evaluateGuess(guess, secret);

    let guesses = [];
    try {
        guesses = JSON.parse(rec.get("guesses_json") || "[]");
    } catch (err) {
        guesses = [];
    }

    guesses.push({
        guess: guess,
        evaluation: evaluation
    });

    rec.set("guesses_json", JSON.stringify(guesses));
    rec.set("attempts", guesses.length);

    const isWin = (guess === secret);
    const isGameOver = isWin || (guesses.length >= rec.get("max_attempts"));

    if (isGameOver) {
        rec.set("finished", true);
        rec.set("won", isWin);
    }

    // Link game to user if user logged in during or before game
    if (e.auth && !rec.get("user")) {
        rec.set("user", e.auth.id);
    }

    e.app.save(rec);

    const response = {
        valid: true,
        guess: guess,
        evaluation: evaluation,
        attempt: guesses.length,
        max_attempts: rec.get("max_attempts"),
        is_win: isWin,
        is_game_over: isGameOver,
        pos: rec.get("pos")
    };

    if (isGameOver) {
        response.secret = secret;
        response.definition_url = engine.getDefinitionUrl(secret);
    }

    return e.json(200, response);
});

routerAdd("GET", "/api/words/check", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const word = (e.request.url.query().get("word") || "").trim().toLowerCase();
    const isValid = word.length > 0 && engine.isValidGuess(word, word.length);
    return e.json(200, {
        word: word,
        valid: isValid,
        length: word.length
    });
});

routerAdd("GET", "/api/game/stats", (e) => {
    if (!e.auth) {
        return e.json(401, { error: "Authentication required to view statistics." });
    }

    // Daily games only: free play is unlimited, so mixing it in would inflate
    // streaks and win rate. date_str is YYYY-MM-DD, so it sorts chronologically
    // and does not depend on the record created/updated timestamps.
    const records = e.app.findRecordsByFilter(
        "games",
        "user = {:uid} && finished = true && mode = 'daily'",
        "-date_str",
        500,
        0,
        { uid: e.auth.id }
    );

    let played = records.length;
    let wins = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    // Process from oldest to newest for streak calculation
    for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        if (r.get("won")) {
            wins++;
            tempStreak++;
            if (tempStreak > maxStreak) {
                maxStreak = tempStreak;
            }
            const att = r.get("attempts");
            if (distribution[att] !== undefined) {
                distribution[att]++;
            }
        } else {
            tempStreak = 0;
        }
    }
    const currentStreak = tempStreak;

    return e.json(200, {
        played: played,
        wins: wins,
        win_rate: played > 0 ? Math.round((wins / played) * 100) : 0,
        current_streak: currentStreak,
        max_streak: maxStreak,
        distribution: distribution
    });
});
