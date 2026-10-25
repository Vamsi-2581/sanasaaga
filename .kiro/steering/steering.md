---
inclusion: always
---
# Sanakuutio — Project Steering

Sanakuutio is a Finnish Wordle-style word game. It is a decoupled microservices stack: a Svelte 5 SPA frontend and a PocketBase (Go + embedded SQLite) backend, each in its own container. The whole stack runs in under 90 MB RAM.

## Tech Stack
- **Frontend**: Svelte 5 (Runes) + Vite 8, PocketBase JS SDK, served by `nginx:alpine`.
- **Backend**: PocketBase v0.25+ with JS hooks (Goja JSVM), embedded SQLite.
- **Containers**: Podman/Docker Compose; multi-stage builds; published to GHCR via GitHub Actions.
- **Node**: 22 (used by CI and the frontend build container).

## Common Commands
Run from the workspace root unless noted.

### Frontend (`frontend/`)
- Install deps: `cd frontend && npm install` (or `npm ci` for CI/reproducible installs)
- Dev server: `cd frontend && npm run dev` → http://localhost:5173 (proxies `/api`, `/_`, `/health` to PocketBase on :8090)
- Build: `cd frontend && npm run build` (outputs `frontend/dist/`)
- There is **no linter** configured and CI validates the frontend by running `npm run build`. Engine smoke tests live in `backend/test/` (`node --test backend/test/`). Match existing code style when editing.

### Backend (`backend/`)
- Run locally (needs the `pocketbase` binary in `backend/`): `cd backend && DAILY_WORD_SECRET=... ./pocketbase serve --http=127.0.0.1:8090`
- Files in `backend/pb_hooks/` are auto-loaded by PocketBase on startup.
- The daily challenge requires the `DAILY_WORD_SECRET` env var (see `.env.example`); the backend refuses to start a daily game if it is unset.

### Containers
- Start: `podman-compose up -d` (or `./run.sh`) — set `DAILY_WORD_SECRET` first (via `.env` or your shell) for the daily challenge.
- App: http://localhost:8000 · Admin UI: http://localhost:8000/_/
- Stop: `podman-compose down`

### Vocabulary
- Regenerate the word list from Kotus/Voikko sources: `python3 scripts/prepare_words.py` → `data/words.json`

## Workspace Layout
- `backend/pb_hooks/` — PocketBase hooks: `init.pb.js` (schema bootstrap), `users.pb.js` (OAuth privacy hook), `game.pb.js` (API routes), `game_engine.js` (Wordle engine), `words.js` (generated dictionary).
- `frontend/src/` — Svelte app: `App.svelte` (orchestrator), `lib/api.js` (API client), `lib/sounds.js` (Web Audio synth), `lib/components/` (UI components), `app.css` (themed global styles).
- `data/words.json` — source parsed Kotus dictionary.
- `old/` — archived Python FastAPI proof-of-concept. Do not modify; not part of the active stack.
- `compose.yaml` (dev, builds locally) / `compose.prod.yaml` (prod, pulls from GHCR).
- `README.md` (features & run instructions) and `ARCHITECTURE.md` (system design) are the source specs.

## Other Steering Files
- `product.md` (always) — product features & non-negotiable design principles.
- `backend.md` — backend conventions (loads when editing `backend/**`).
- `frontend.md` — frontend conventions (loads when editing `frontend/**`).
- `architecture.md` (auto) — system architecture, data model, deployment (loads on demand).
