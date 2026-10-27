---
inclusion: fileMatch
fileMatchPattern: 'backend/**'
---
# Backend Conventions (PocketBase JSVM)

The backend is a single PocketBase binary with JS hooks executed in the Goja JSVM (not Node). Match the patterns in `backend/pb_hooks/`.

## File conventions
- `*.pb.js` — hook registration only, auto-loaded by PocketBase on startup (`init.pb.js`, `game.pb.js`, `users.pb.js`). Their callbacks run in a separate VM, so all logic must live in required modules and be `require`-d *inside* the callback; top-level declarations there are invisible to callbacks and collide across files.
- Plain `*.js` — modules loaded via `require(\`${__hooks}/file.js\`)` (e.g. `game_engine.js`, `schema.js`, `gamer_tag.js`, `words.js`). Export with `module.exports = { ... }`.
- Start every file with a header comment: `// backend/pb_hooks/<file>.js` + a one-line description.

## JSVM constraints (Goja)
- Use CommonJS (`require` / `module.exports`). No ESM `import`.
- Be conservative with modern syntax. Use **string concatenation** for error messages (template literals are avoided in this codebase). `const`/`let`, arrow functions, `for...of`, and standard `Array` methods all work.
- PocketBase-provided globals: `$security.sha256(str)`, `$security.randomString(n)`, `$os.getenv(name)` (read OS environment variables), `routerAdd`, `onBootstrap`, `onRecordCreateRequest`, and the constructors `Collection`, `Record`, `TextField`, `NumberField`, `BoolField`, `RelationField`.

## API routes (`game.pb.js` pattern)
- Register with `routerAdd("METHOD", "/path", (e) => { ... return e.json(status, body); })`.
- Read body: `const body = e.requestInfo().body || {};`. Read query: `e.request.url.query().get("key")`.
- Auth: `e.auth` is the authenticated user record (null for guests). The client sends `Authorization: Bearer <token>`.
- DB access: `e.app.findCollectionByNameOrId(name)`, `e.app.findFirstRecordByFilter(coll, filter, params)`, `e.app.findRecordsByFilter(coll, filter, sort, limit, offset, params)`, `e.app.save(record)`.
- `findFirstRecordByFilter` **throws** when no record matches — always wrap it in try/catch.
- Validate input and return `e.json(400, { error: "..." })` with **Finnish** messages for user-facing errors.
- Create a record: `const rec = new Record(col); rec.set("field", value); e.app.save(rec);`.

## Anti-cheat rules
- Never include `secret` in a response unless the game is `finished`. On game-over, also return `definition_url`.
- The server is the source of truth for word validity and tile evaluation. Do not move validation logic to the client.

## Game engine (`game_engine.js`)
- **Two-pass coloring**: pass 1 marks `correct` (exact match) and counts remaining unclaimed secret letters; pass 2 marks `present` (letter exists elsewhere, decrementing the count) otherwise `absent`.
- `isValidGuess(guess, length)` checks in-memory `Set`s built from `words.guesses[len]`.
- **Daily word** (`pickDailyTarget(dateStr)`): one word per Helsinki day, identical for everyone, with random length (4–8) and word class. Seed = `$os.getenv("DAILY_WORD_SECRET") + ":" + HelsinkiDate` → `$security.sha256`; the first 8 hex chars pick the length (`4 + (n % 5)`), the next 8 hex chars index into the top-600 most-frequent words of that length. Throws if `DAILY_WORD_SECRET` is unset.
- **Free play word** (`pickRandomTarget(length, category)`): random pick from the top 70% most-frequent words of the chosen length/category.
- **Helsinki date** (`getFinlandDateStr()`): derives the Europe/Helsinki date from the UTC clock with EU DST handling (EET = UTC+2 / EEST = UTC+3), independent of the container's TZ. Used for the daily seed and the rollover comparison.
- `getDefinitionUrl(word)` returns `https://www.kielitoimistonsanakirja.fi/#/<encoded_word>`.
- Shared helpers `serializeGame(rec, dayChanged)`, `createDailyGame(app, authId, today, targetObj)`, and `createRandomGame(app, authId, today, length, category, targetObj)` build the API response / persist a game record; reuse them instead of duplicating record creation.

## Daily challenge lifecycle (midnight rollover)
- The daily word is tied to a Helsinki date (`date_str`). The client never sends the date — the server computes it with `getFinlandDateStr()`.
- `/api/game/new` (daily): if the client sends `session_id`, resume that exact game — **today's game resumes whether finished or not** (a completed daily must keep showing its result until midnight), while an *earlier* day's game resumes only while still unfinished (`day_changed: true`); a finished earlier game falls through to create today's. Else for authed users, resume today's game (finished or not), then any unfinished daily from an earlier date. Otherwise create today's. Daily ignores the client's `length`/`category` — both are random.
- `/api/game/daily/abandon`: marks an in-progress previous-day daily game as `finished` + `won = false` (a loss), then returns (or creates) today's game. Authed users must own the game; guests act by `session_id`.

## Free-play lifecycle (one game per length)
- Up to six in-progress games coexist per player: the daily plus one free game per length (4–8). Each length is an independent slot.
- `/api/game/new` (random): resume by `session_id` (must be a `random` game of the SAME `length`, unfinished, accessible), else for authed users resume their most recent unfinished `random` game of that length, else create a new one. Free games persist until finished — switching length or toggling daily↔free never discards them.
- `/api/game/random/reset`: discard the caller's current unfinished free game of a given `length` (hard `delete`, NOT recorded as a loss — free play is unlimited so resets must not touch stats) and start a fresh one. Ownership-checked.
- The client tracks each slot's `session_id` in a `localStorage` map and sends the relevant one; authed users also resume server-side by `user+mode+length` (works across devices).

## Schema (`init.pb.js` -> `schema.js`)
- There are no migrations (the container ships only `pb_hooks`), so schema setup runs on every boot and must converge both a fresh and an existing `pb_data`: create collections if missing, add any missing field/rule, never assume an empty database. A second boot must be a no-op.
- Collections: `games`, `friendships`. They are built by hand, so the `created`/`updated` autodate fields have to be added explicitly (without them any `-created` sort fails).
- `games` fields: `session_id`, `user` (relation), `mode`, `date_str` (`YYYY-MM-DD`), `length` (4–8), `category` (`all|substantiivi|adjektiivi|verbi`), `secret`, `pos`, `guesses_json` (serialized array of `{guess, evaluation}`), `attempts`, `max_attempts` (6), `won`, `finished`.
- Access rules let users see only their own games: `@request.auth.id != '' && user.id = @request.auth.id`. Create/update/delete are locked (`null` = superusers only) — all writes go through the hooks via `app.save`; an empty string rule would mean "anyone".
- Add SQL indexes: unique on `session_id`, and on `(user, date_str, mode)`.

## Privacy and accounts (`users.pb.js`, `gamer_tag.js`)
- Accounts are created through Google OAuth2 only. The users `createRule` must stay open because PocketBase checks it for OAuth2 signup, so plain email/password creates are rejected in the create hook instead (`passwordAuth` is also disabled as defence in depth).
- On `users` create: set `emailVisibility = false`, `name = ""`, and assign an animal gamer tag (`Kettu`, `Ilves`, `Karhu`, `Susi`, `Ahma`, `Norppa`, `Hirvi`, `Metso`, `Kuukkeli`, `Siili`, `Saukko`, `Pöllö` + 3-digit number) if `username` is empty or equals the email prefix.
- The `username` field is added by `schema.js`; existing accounts are backfilled there when the field is first created.
