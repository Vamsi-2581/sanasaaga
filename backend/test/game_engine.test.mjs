// backend/test/game_engine.test.mjs
// Smoke tests for the Sanasaaga Wordle engine, run with the Node test runner:
//   node --test "backend/test/**/*.test.mjs"
// The hooks run in PocketBase's Goja JSVM; here we emulate the two globals the
// engine uses ($os, $security) and let CommonJS require resolve words.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooks = path.resolve(here, '../pb_hooks');
const require = createRequire(import.meta.url);

// PocketBase globals used by game_engine.js
globalThis.__hooks = hooks;
globalThis.$os = { getenv: (name) => process.env[name] };
globalThis.$security = {
    sha256: (str) => createHash('sha256').update(str, 'utf8').digest('hex'),
    randomString: (n) => 'x'.repeat(n),
};

// Minimal stand-ins for the PocketBase JSVM globals used when persisting games.
// `new Record(col)` yields an object with get/set backed by a plain map; the
// fake app records every save so tests can assert what was written.
class FakeRecord {
    constructor() { this._fields = {}; }
    set(key, value) { this._fields[key] = value; }
    get(key) { return this._fields[key]; }
}
globalThis.Record = FakeRecord;

const makeApp = () => {
    const saved = [];
    return {
        saved,
        findCollectionByNameOrId: (name) => ({ name }),
        save: (rec) => { saved.push(rec); },
    };
};

const engine = require(path.join(hooks, 'game_engine.js'));
const words = require(path.join(hooks, 'words.js'));

const makeRecord = (fields) => ({ get: (key) => fields[key] });

describe('evaluateGuess (two-pass coloring)', () => {
    test('exact match is all correct', () => {
        assert.deepEqual(engine.evaluateGuess('kissa', 'kissa'), [
            'correct', 'correct', 'correct', 'correct', 'correct',
        ]);
    });

    test('no matching letters is all absent', () => {
        assert.deepEqual(engine.evaluateGuess('kissa', 'tunto'), [
            'absent', 'absent', 'absent', 'absent', 'absent',
        ]);
    });

    test('duplicate secret letters are each claimed once', () => {
        // secret kissa has two s; guess sissi has three s-like positions.
        assert.deepEqual(engine.evaluateGuess('sissi', 'kissa'), [
            'absent', 'correct', 'correct', 'correct', 'absent',
        ]);
    });

    test('exact matches consume the letter before present matches', () => {
        // secret kana has two a; both are taken by the exact matches, so the
        // other two a in the guess must stay absent.
        assert.deepEqual(engine.evaluateGuess('aaaa', 'kana'), [
            'absent', 'correct', 'absent', 'correct',
        ]);
    });

    test('present letters are counted only as often as the secret allows', () => {
        assert.deepEqual(engine.evaluateGuess('naan', 'kana'), [
            'present', 'correct', 'present', 'absent',
        ]);
    });

    test('guess with more repeats than the secret has', () => {
        // secret kusi has a single s, at index 2. Guess ssss: only that one
        // position may light up; the remaining s must stay absent.
        assert.deepEqual(engine.evaluateGuess('ssss', 'kusi'), [
            'absent', 'absent', 'correct', 'absent',
        ]);
        assert.deepEqual(engine.evaluateGuess('usss', 'kusi'), [
            'present', 'absent', 'correct', 'absent',
        ]);
    });
});

describe('isValidGuess', () => {
    const known = words.guesses['5'][0];

    test('accepts a word from the dictionary', () => {
        assert.equal(engine.isValidGuess(known, 5), true);
    });

    test('rejects a non-word', () => {
        assert.equal(engine.isValidGuess('zzzzz', 5), false);
    });

    test('rejects a word of the wrong length for the game', () => {
        const fourLetter = words.guesses['4'][0];
        assert.equal(engine.isValidGuess(fourLetter, 5), false);
    });
});

describe('target pools', () => {
    test('random targets respect length and category', () => {
        for (const length of [4, 5, 6, 7, 8]) {
            for (const category of ['all', 'substantiivi', 'adjektiivi', 'verbi']) {
                const target = engine.pickRandomTarget(length, category);
                assert.equal(target.w.length, length, `${length}/${category}`);
                if (category !== 'all') {
                    assert.equal(target.pos, category, `${length}/${category}`);
                }
            }
        }
    });

    test('unknown category falls back to the full pool', () => {
        const pool = engine.getTargetPool(5, 'nonexistent');
        assert.ok(pool.length > 0);
        assert.equal(pool.length, engine.getTargetPool(5, 'all').length);
    });
});

describe('pickDailyTarget', () => {
    const withSecret = (secret, fn) => {
        const previous = process.env.DAILY_WORD_SECRET;
        if (secret === undefined) delete process.env.DAILY_WORD_SECRET;
        else process.env.DAILY_WORD_SECRET = secret;
        try {
            return fn();
        } finally {
            if (previous === undefined) delete process.env.DAILY_WORD_SECRET;
            else process.env.DAILY_WORD_SECRET = previous;
        }
    };

    test('throws when DAILY_WORD_SECRET is missing', () => {
        withSecret(undefined, () => {
            assert.throws(() => engine.pickDailyTarget('2025-01-01'), /DAILY_WORD_SECRET/);
        });
    });

    test('is deterministic for the same secret and date', () => {
        withSecret('smoke-secret', () => {
            const a = engine.pickDailyTarget('2025-06-15');
            const b = engine.pickDailyTarget('2025-06-15');
            assert.deepEqual(a, b);
            assert.ok(a.w.length >= 4 && a.w.length <= 8);
        });
    });

    test('changes with the date and with the secret', () => {
        withSecret('smoke-secret', () => {
            const days = ['2025-06-15', '2025-06-16', '2025-06-17', '2025-06-18'];
            const picked = new Set(days.map((d) => engine.pickDailyTarget(d).w));
            assert.ok(picked.size > 1, 'consecutive days should not all share one word');

            const other = engine.pickDailyTarget('2025-06-15').w;
            withSecret('different-secret', () => {
                const rotated = engine.pickDailyTarget('2025-06-15').w;
                assert.notEqual(rotated, other);
            });
        });
    });
});

describe('getFinlandDateStr', () => {
    const at = (iso, fn) => (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: new Date(iso).getTime() });
        try {
            return fn();
        } finally {
            t.mock.timers.reset();
        }
    };

    test('uses EET (+2) in winter', at('2025-01-31T21:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-01-31');
    }));

    test('rolls over before UTC midnight in winter', at('2025-01-31T22:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-02-01');
    }));

    test('uses EEST (+3) after the March transition', at('2025-03-30T22:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-03-31');
    }));

    test('still EET just before the March transition', at('2025-03-30T00:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-03-30');
    }));

    test('uses EEST just before the October transition', at('2025-10-25T21:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-10-26');
    }));

    test('uses EET just after the October transition', at('2025-10-26T22:30:00Z', () => {
        assert.equal(engine.getFinlandDateStr(), '2025-10-27');
    }));
});

describe('canAccessGame', () => {
    test('guest games are playable by anyone', () => {
        assert.equal(engine.canAccessGame('', null), true);
        assert.equal(engine.canAccessGame('', 'user1'), true);
    });

    test('owned games only by their owner', () => {
        assert.equal(engine.canAccessGame('user1', 'user1'), true);
        assert.equal(engine.canAccessGame('user1', 'user2'), false);
        assert.equal(engine.canAccessGame('user1', null), false);
    });
});

describe('isAbandonable', () => {
    test('only earlier dates may be abandoned', () => {
        assert.equal(engine.isAbandonable('2025-06-14', '2025-06-15'), true);
        assert.equal(engine.isAbandonable('2025-06-15', '2025-06-15'), false);
        assert.equal(engine.isAbandonable('2025-06-16', '2025-06-15'), false);
    });

    test('missing date is not abandonable', () => {
        assert.equal(engine.isAbandonable('', '2025-06-15'), false);
        assert.equal(engine.isAbandonable(undefined, '2025-06-15'), false);
    });
});

describe('serializeGame (anti-cheat)', () => {
    const base = {
        session_id: 'abc123',
        length: 5,
        category: 'all',
        mode: 'daily',
        date_str: '2025-06-15',
        max_attempts: 6,
        pos: 'substantiivi',
        guesses_json: JSON.stringify([{ guess: 'kissa', evaluation: ['absent'] }]),
        finished: false,
        won: false,
        secret: 'kalaa',
    };

    test('never exposes the secret or definition while unfinished', () => {
        const res = engine.serializeGame(makeRecord(base));
        assert.equal('secret' in res, false);
        assert.equal('definition_url' in res, false);
        assert.equal(res.guesses.length, 1);
    });

    test('reveals the secret and definition once finished', () => {
        const res = engine.serializeGame(makeRecord({ ...base, finished: true, won: true }));
        assert.equal(res.secret, 'kalaa');
        assert.equal(res.definition_url, engine.getDefinitionUrl('kalaa'));
        assert.match(res.definition_url, /kielitoimistonsanakirja/);
    });

    test('survives corrupt guesses_json', () => {
        const res = engine.serializeGame(makeRecord({ ...base, guesses_json: 'not json' }));
        assert.deepEqual(res.guesses, []);
    });
});

describe('createRandomGame', () => {
    test('persists a free game record with the given length and category', () => {
        const app = makeApp();
        const target = { w: 'talot', pos: 'substantiivi' };
        engine.createRandomGame(app, 'user1', '2025-06-15', 5, 'substantiivi', target);

        assert.equal(app.saved.length, 1, 'exactly one record saved');
        const rec = app.saved[0];
        assert.equal(rec.get('mode'), 'random');
        assert.equal(rec.get('length'), 5);
        assert.equal(rec.get('category'), 'substantiivi');
        assert.equal(rec.get('secret'), 'talot');
        assert.equal(rec.get('pos'), 'substantiivi');
        assert.equal(rec.get('user'), 'user1');
        assert.equal(rec.get('date_str'), '2025-06-15');
        assert.equal(rec.get('guesses_json'), '[]');
        assert.equal(rec.get('attempts'), 0);
        assert.equal(rec.get('max_attempts'), 6);
        assert.equal(rec.get('finished'), false);
        assert.equal(rec.get('won'), false);
        assert.ok(rec.get('session_id'), 'session_id is set');
    });

    test('guest game stores no user relation', () => {
        const app = makeApp();
        engine.createRandomGame(app, null, '2025-06-15', 4, 'all', { w: 'kala', pos: 'substantiivi' });
        assert.equal(app.saved[0].get('user'), undefined);
    });

    test('returned payload never leaks the secret (fresh game)', () => {
        const app = makeApp();
        const res = engine.createRandomGame(app, 'user1', '2025-06-15', 6, 'all', { w: 'kissat', pos: 'substantiivi' });
        assert.equal('secret' in res, false);
        assert.equal('definition_url' in res, false);
        assert.deepEqual(res.guesses, []);
        assert.equal(res.mode, 'random');
        assert.equal(res.length, 6);
        assert.equal(res.category, 'all');
        assert.equal(res.finished, false);
        assert.equal(res.won, false);
        assert.equal(res.day_changed, false);
        assert.equal(res.session_id, app.saved[0].get('session_id'), 'payload session matches record');
    });
});

describe('createDailyGame', () => {
    test('persists a daily game and derives length from the target word', () => {
        const app = makeApp();
        const res = engine.createDailyGame(app, 'user1', '2025-06-15', { w: 'kissat', pos: 'substantiivi' });

        assert.equal(app.saved.length, 1);
        const rec = app.saved[0];
        assert.equal(rec.get('mode'), 'daily');
        assert.equal(rec.get('category'), 'all');
        assert.equal(rec.get('length'), 6, 'length comes from the word, not a param');
        assert.equal(rec.get('secret'), 'kissat');
        assert.equal(rec.get('date_str'), '2025-06-15');

        // Response hides the secret for the fresh (unfinished) game.
        assert.equal('secret' in res, false);
        assert.equal(res.length, 6);
        assert.equal(res.mode, 'daily');
    });

    test('guest daily game stores no user relation', () => {
        const app = makeApp();
        engine.createDailyGame(app, null, '2025-06-15', { w: 'talo', pos: 'substantiivi' });
        assert.equal(app.saved[0].get('user'), undefined);
    });
});
