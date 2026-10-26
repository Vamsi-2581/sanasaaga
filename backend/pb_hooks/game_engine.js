// backend/pb_hooks/game_engine.js
// Sanasaaga Finnish Wordle engine: daily target selection, free-play selection,
// guess validation and the two-pass letter coloring algorithm.
const words = require(`${__hooks}/words.js`);

// Build lookup sets for fast O(1) guess validation
const guessSets = {};
for (const len in words.guesses) {
    const arr = words.guesses[len];
    const s = new Set();
    for (var i = 0; i < arr.length; i++) {
        s.add(arr[i]);
    }
    guessSets[len] = s;
}

function getTargetPool(length, category) {
    const lenStr = String(length);
    let pool = words.targets[lenStr] || [];
    if (category && category !== "all") {
        pool = pool.filter(function (w) { return w.pos === category; });
    }
    if (pool.length === 0) {
        pool = words.targets[lenStr] || [];
    }
    return pool;
}

// ---------------------------------------------------------------------------
// Finland timezone helpers
// ---------------------------------------------------------------------------
// The daily challenge rolls over at midnight Helsinki time. Finland is EET
// (UTC+2) in winter and EEST (UTC+3) during summer DST. We derive the Helsinki
// date from the UTC clock so the result is correct no matter the container's
// TZ configuration. EU DST rule: from the last Sunday of March 01:00 UTC until
// the last Sunday of October 01:00 UTC.
// ---------------------------------------------------------------------------

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function lastSundayUTC(year, monthIdx) {
    // Last day of the given month (0-indexed), then walk back to a Sunday.
    var lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    var d = lastDay;
    while (new Date(Date.UTC(year, monthIdx, d)).getUTCDay() !== 0) {
        d--;
    }
    // EU DST transitions occur at 01:00 UTC.
    return Date.UTC(year, monthIdx, d, 1, 0, 0);
}

function getFinlandDateStr() {
    var now = new Date();
    var utcMs = now.getTime();
    var year = now.getUTCFullYear();
    var dstStart = lastSundayUTC(year, 2);  // March (0-indexed)
    var dstEnd = lastSundayUTC(year, 9);    // October (0-indexed)
    var isDST = utcMs >= dstStart && utcMs < dstEnd;
    var offsetHours = isDST ? 3 : 2;
    var fd = new Date(utcMs + offsetHours * 3600 * 1000);
    return fd.getUTCFullYear() + "-" + pad2(fd.getUTCMonth() + 1) + "-" + pad2(fd.getUTCDate());
}

// ---------------------------------------------------------------------------
// Daily challenge target
// ---------------------------------------------------------------------------
// One word per day, identical for every player. Both the word length (4-8) and
// the word class (all classes) are random. The seed combines a server-side
// secret (the DAILY_WORD_SECRET env var) with the Helsinki date, so even a
// player who has the dictionary and knows the algorithm cannot reproduce the
// daily word without the secret.
// ---------------------------------------------------------------------------

function pickDailyTarget(dateStr) {
    var secret = $os.getenv("DAILY_WORD_SECRET");
    if (!secret) {
        throw new Error("DAILY_WORD_SECRET environment variable is not set. Configure it before enabling the daily challenge.");
    }

    var d = dateStr || getFinlandDateStr();
    var hash = $security.sha256(secret + ":" + d);

    // First 8 hex chars -> word length (4..8, each ~20% chance).
    var lenPart = parseInt(hash.substring(0, 8), 16);
    var length = 4 + (lenPart % 5);

    var pool = getTargetPool(length, "all");
    if (!pool || pool.length === 0) {
        throw new Error("No target words found for daily length=" + length);
    }

    // Next 8 hex chars -> index into the most-frequent slice (<=600) of that length.
    var idxPart = parseInt(hash.substring(8, 16), 16);
    var sliceLen = Math.min(pool.length, 600);
    var topSlice = pool.slice(0, sliceLen);
    return topSlice[idxPart % topSlice.length];
}

// ---------------------------------------------------------------------------
// Free play target (random)
// ---------------------------------------------------------------------------

function pickRandomTarget(length, category) {
    var pool = getTargetPool(length, category);
    if (!pool || pool.length === 0) {
        throw new Error("No target words found for length=" + length + ", category=" + category);
    }
    var cutoff = Math.max(10, Math.floor(pool.length * 0.7));
    var topPool = pool.slice(0, cutoff);
    return topPool[Math.floor(Math.random() * topPool.length)];
}

// ---------------------------------------------------------------------------
// Serialization helpers (shared with the API routes)
// ---------------------------------------------------------------------------

function serializeGame(rec, dayChanged) {
    var parsedGuesses = [];
    try {
        parsedGuesses = JSON.parse(rec.get("guesses_json") || "[]");
    } catch (err) {
        parsedGuesses = [];
    }
    var res = {
        session_id: rec.get("session_id"),
        length: rec.get("length"),
        category: rec.get("category"),
        mode: rec.get("mode"),
        date_str: rec.get("date_str"),
        max_attempts: rec.get("max_attempts"),
        pos: rec.get("pos"),
        guesses: parsedGuesses,
        finished: rec.get("finished"),
        won: rec.get("won"),
        day_changed: !!dayChanged
    };
    if (rec.get("finished")) {
        var secret = rec.get("secret");
        res.secret = secret;
        res.definition_url = getDefinitionUrl(secret);
    }
    return res;
}

function createDailyGame(app, authId, today, targetObj) {
    var gamesCol = app.findCollectionByNameOrId("games");
    var rec = new Record(gamesCol);
    var sessionId = $security.randomString(24);

    rec.set("session_id", sessionId);
    if (authId) {
        rec.set("user", authId);
    }
    rec.set("mode", "daily");
    rec.set("date_str", today);
    rec.set("length", targetObj.w.length);
    rec.set("category", "all");
    rec.set("secret", targetObj.w);
    rec.set("pos", targetObj.pos);
    rec.set("guesses_json", "[]");
    rec.set("attempts", 0);
    rec.set("max_attempts", 6);
    rec.set("won", false);
    rec.set("finished", false);
    app.save(rec);

    return {
        session_id: sessionId,
        length: targetObj.w.length,
        category: "all",
        mode: "daily",
        date_str: today,
        max_attempts: 6,
        pos: targetObj.pos,
        guesses: [],
        finished: false,
        won: false,
        day_changed: false
    };
}

// ---------------------------------------------------------------------------
// Core game logic
// ---------------------------------------------------------------------------

function evaluateGuess(guess, secret) {
    const n = guess.length;
    const result = new Array(n);
    const secretCounts = {};

    // 1st pass: exact matches
    for (var i = 0; i < n; i++) {
        if (guess[i] === secret[i]) {
            result[i] = "correct";
        } else {
            result[i] = "absent";
            const ch = secret[i];
            secretCounts[ch] = (secretCounts[ch] || 0) + 1;
        }
    }

    // 2nd pass: partial matches (present)
    for (var j = 0; j < n; j++) {
        if (result[j] !== "correct") {
            const ch = guess[j];
            if ((secretCounts[ch] || 0) > 0) {
                result[j] = "present";
                secretCounts[ch]--;
            }
        }
    }

    return result;
}

function isValidGuess(guess, length) {
    const lenStr = String(length || guess.length);
    const s = guessSets[lenStr];
    return s ? s.has(guess) : false;
}

// ---------------------------------------------------------------------------
// Access control helpers
// ---------------------------------------------------------------------------

// A game belongs either to a user or to nobody (guest game). Guests may only
// touch unowned games; authenticated users may only touch their own.
// `gameUserId` is the stored relation id ("" for guest games).
function canAccessGame(gameUserId, authId) {
    if (!gameUserId) return true;
    return !!authId && gameUserId === authId;
}

// Only a daily game from an earlier Helsinki date may be given up; abandoning
// today's game would reveal today's secret word.
function isAbandonable(dateStr, today) {
    return !!dateStr && dateStr < today;
}

function getDefinitionUrl(word) {
    return "https://www.kielitoimistonsanakirja.fi/#/" + encodeURIComponent(word);
}

module.exports = {
    getTargetPool: getTargetPool,
    pickDailyTarget: pickDailyTarget,
    pickRandomTarget: pickRandomTarget,
    evaluateGuess: evaluateGuess,
    isValidGuess: isValidGuess,
    canAccessGame: canAccessGame,
    isAbandonable: isAbandonable,
    getDefinitionUrl: getDefinitionUrl,
    getFinlandDateStr: getFinlandDateStr,
    serializeGame: serializeGame,
    createDailyGame: createDailyGame
};
