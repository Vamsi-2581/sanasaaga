# AGENTS.md

Sanasaaga — Finnish Wordle clone. Svelte 5 SPA (`frontend/`) + PocketBase with JS hooks (`backend/`), one container each.

Deep reference: `.kiro/steering/*.md` (conventions), `ARCHITECTURE.md` (design, API, data model), `README.md` (features). Read them when the task touches those areas; they are specs, not optional reading.

## Commands

- Frontend build (the only automated check): `cd frontend && npm run build`
- Engine smoke tests: `node --test backend/test/`
- Frontend dev: `cd frontend && npm run dev` → http://localhost:5173
- Backend locally: `cd backend && DAILY_WORD_SECRET=dev ./pocketbase serve --http=127.0.0.1:8090`
- Full stack: `./run.sh` or `podman-compose up -d` → http://localhost:8000

No linter exists. There are smoke tests for the game engine only (`backend/test/`); nothing exercises the HTTP routes. `npm run build` plus `node --test backend/test/` are the gates: run them before claiming work is done, and state plainly when a change could not be verified. `old/` is an archived PoC — never modify it.

## Backend (`backend/pb_hooks/`)

- Goja JSVM, **not Node**. CommonJS only: `require` / `module.exports`, no `import`.
- `*.pb.js` files only *register* hooks; their callbacks run in a separate VM where only `require`d modules exist. Put logic in plain `*.js` modules and `require` them **inside** the callback. Top-level declarations in `*.pb.js` are invisible to callbacks and collide across files.
- Prefer string concatenation over template literals (existing convention).
- Schema lives in `schema.js` and must be **idempotent**: there are no migrations, so it has to converge both a fresh and an existing `pb_data` on every boot (add missing fields/rules, never assume empty).
- `games` API rules are locked (`null`). All writes go through hooks via `app.save`; never open a create/update rule on it.
- `findFirstRecordByFilter` throws when nothing matches — always wrap in try/catch.
- Register routes with `routerAdd`; read body via `e.requestInfo().body`, query via `e.request.url.query()`.
- Reuse `serializeGame` / `createDailyGame` and the existing helpers in `game_engine.js` instead of duplicating record creation or response shaping.
- `DAILY_WORD_SECRET` is required for the daily challenge; never hardcode or log it.

Backend routes are not covered by the node suite — verify schema/route changes against a real PocketBase binary before declaring them done.

## Frontend (`frontend/src/`)

- Svelte 5 Runes only. `$state` / `$derived` / `$props` / `$effect`. Never `export let`, `$:`, or `on:click` — use `onclick={...}`.
- `App.svelte` is the single orchestrator. Components stay presentational; put logic in `App.svelte` and `lib/*.js`.
- Match the surrounding style: 2 spaces, single quotes, semicolons.
- Never add audio asset files; sounds are synthesized in `lib/sounds.js`.

## Non-negotiables

- **Server is authoritative.** Never send `secret` before the game is finished, and never move guess validation or tile evaluation to the client.
- **No PII.** Never return, log, or store email or real names in API responses.
- **Finnish UI.** All user-facing strings (buttons, toasts, errors) are Finnish; code identifiers and comments may be English.
- **Low footprint.** No heavy dependencies. Prefer zero-dependency solutions.
- **Decoupled API.** The backend stays plain REST/JSON; do not add direct collection access from the frontend beyond what hooks already allow.

## Commit attribution

Every commit produced by an agent must identify its harness in a git trailer, after the body and separated by a blank line:

```
Assisted-by: <harness> (<model>)
```

- Read the model from the environment, never from memory — models misreport their own version. In pi: `$PI_MODEL` (and `$PI_PROVIDER` if the model name is ambiguous).
- pi → `Assisted-by: pi (deepseek-flash)`.
- Other harnesses → the tool name plus whatever model identifier it actually exposes (`Assisted-by: Claude Code (claude-sonnet-4-5)`).
- Unknown model → name the harness only (`Assisted-by: pi`). Do not invent a version or provider.
- One trailer per commit. If the harness already appends its own, do not duplicate it.
- This is disclosure, not authorship: keep the human author, and do not add `Co-authored-by:` for yourself.
- CI/automation commits (renovate, release bots) are exempt.

## Vocabulary

`python3 scripts/prepare_words.py` regenerates `data/words.json` from Kotus/Voikko sources. It is slow and the output is large — only run it when the task is about the dictionary.
