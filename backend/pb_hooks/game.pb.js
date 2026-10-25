// backend/pb_hooks/game.pb.js
// Sanakuutio Game API endpoints

routerAdd("GET", "/health", (e) => {
    return e.json(200, {
        status: "ok",
        app: "Sanakuutio",
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
                    const gameUser = rec.get("user");
                    // Resume only the owner's game, or an unowned (guest) game.
                    if (!gameUser || (e.auth && gameUser === e.auth.id)) {
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
    const length = Number(body.length) || 5;
    if (length < 4 || length > 8) {
        return e.json(400, { error: "Sanan pituuden on oltava 4-8 kirjainta." });
    }
    const category = body.category || "all";

    const targetObj = engine.pickRandomTarget(length, category);
    const sessionId = $security.randomString(24);

    const gamesCol = e.app.findCollectionByNameOrId("games");
    const rec = new Record(gamesCol);
    rec.set("session_id", sessionId);
    if (e.auth) {
        rec.set("user", e.auth.id);
    }
    rec.set("mode", "random");
    rec.set("date_str", today);
    rec.set("length", length);
    rec.set("category", category);
    rec.set("secret", targetObj.w);
    rec.set("pos", targetObj.pos);
    rec.set("guesses_json", "[]");
    rec.set("attempts", 0);
    rec.set("max_attempts", 6);
    rec.set("won", false);
    rec.set("finished", false);
    e.app.save(rec);

    return e.json(200, {
        session_id: sessionId,
        length: length,
        category: category,
        mode: "random",
        date_str: today,
        max_attempts: 6,
        pos: targetObj.pos,
        guesses: [],
        finished: false,
        won: false,
        day_changed: false
    });
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

    // Ownership check for authenticated users.
    if (e.auth) {
        const gameUser = rec.get("user");
        if (gameUser && gameUser !== e.auth.id) {
            return e.json(403, { error: "Ei oikeutta tähän peliin." });
        }
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

    // Fetch user's finished games
    const records = e.app.findRecordsByFilter(
        "games",
        "user = {:uid} && finished = true",
        "-created",
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
