// Finnish Wordle Game Engine for PocketBase JSVM
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

function pickTarget(length, category, mode, dateStr) {
    const pool = getTargetPool(length, category);
    if (!pool || pool.length === 0) {
        throw new Error("No target words found for length=" + length + ", category=" + category);
    }

    if (mode === "daily") {
        const d = dateStr || new Date().toISOString().slice(0, 10);
        const seedStr = d + "-" + length + "-" + category;
        const hash = $security.sha256(seedStr);
        // Take 8 hex chars -> safe 32-bit int
        const h = parseInt(hash.substring(0, 8), 16);
        const sliceLen = Math.min(pool.length, 600);
        const topSlice = pool.slice(0, sliceLen);
        return topSlice[h % topSlice.length];
    } else {
        const cutoff = Math.max(10, Math.floor(pool.length * 0.7));
        const topPool = pool.slice(0, cutoff);
        const idx = Math.floor(Math.random() * topPool.length);
        return topPool[idx];
    }
}

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

function getDefinitionUrl(word) {
    return "https://www.kielitoimistonsanakirja.fi/#/" + encodeURIComponent(word);
}

module.exports = {
    getTargetPool: getTargetPool,
    pickTarget: pickTarget,
    evaluateGuess: evaluateGuess,
    isValidGuess: isValidGuess,
    getDefinitionUrl: getDefinitionUrl
};
