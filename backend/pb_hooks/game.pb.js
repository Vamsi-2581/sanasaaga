// backend/pb_hooks/game.pb.js
// Sanakuutio Game API endpoints

routerAdd("GET", "/health", (e) => {
    return e.json(200, {
        status: "ok",
        app: "Sanakuutio",
        version: "2.0.0-pocketbase"
    });
});

routerAdd("POST", "/api/game/new", (e) => {
    const engine = require(`${__hooks}/game_engine.js`);
    const body = e.requestInfo().body || {};

    const length = Number(body.length) || 5;
    if (length < 4 || length > 8) {
        return e.json(400, { error: "Word length must be between 4 and 8 letters." });
    }

    const category = body.category || "all";
    const mode = body.mode || "random";
    const dateStr = body.date_str || new Date().toISOString().slice(0, 10);

    // If logged in and playing daily mode, check if player already has an ongoing or finished game for this date and length
    if (e.auth && mode === "daily") {
        try {
            const existing = e.app.findFirstRecordByFilter(
                "games",
                "user = {:uid} && date_str = {:d} && length = {:len} && mode = 'daily'",
                { uid: e.auth.id, d: dateStr, len: length }
            );
            if (existing) {
                let parsedGuesses = [];
                try {
                    parsedGuesses = JSON.parse(existing.get("guesses_json") || "[]");
                } catch (err) {
                    parsedGuesses = [];
                }

                const res = {
                    session_id: existing.get("session_id"),
                    length: existing.get("length"),
                    category: existing.get("category"),
                    mode: existing.get("mode"),
                    date_str: existing.get("date_str"),
                    max_attempts: existing.get("max_attempts"),
                    pos: existing.get("pos"),
                    guesses: parsedGuesses,
                    finished: existing.get("finished"),
                    won: existing.get("won")
                };
                if (existing.get("finished")) {
                    res.secret = existing.get("secret");
                    res.definition_url = engine.getDefinitionUrl(existing.get("secret"));
                }
                return e.json(200, res);
            }
        } catch (err) {
            // Not found, proceed to create new game
        }
    }

    const targetObj = engine.pickTarget(length, category, mode, dateStr);
    const sessionId = $security.randomString(24);

    const gamesCol = e.app.findCollectionByNameOrId("games");
    const rec = new Record(gamesCol);
    rec.set("session_id", sessionId);
    if (e.auth) {
        rec.set("user", e.auth.id);
    }
    rec.set("mode", mode);
    rec.set("date_str", dateStr);
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
        mode: mode,
        date_str: dateStr,
        max_attempts: 6,
        pos: targetObj.pos,
        guesses: [],
        finished: false,
        won: false
    });
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
