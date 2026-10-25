---
inclusion: auto
name: architecture
description: Sanakuutio system architecture, network topology, API spec, data model, and deployment/reverse-proxy setup.
---
# Sanakuutio — System Architecture

Concise reference for architecture, data model, and deployment questions. Full details live in `ARCHITECTURE.md`.

## Topology
Browser/PWA → reverse proxy (Caddy or Nginx, HTTPS :443) → frontend container (nginx:alpine, static SPA) and backend container (PocketBase :8090).

- In **dev**: Vite (:5173) proxies `/api`, `/_`, `/health` to PocketBase on `http://127.0.0.1:8090`.
- In **containers**: the frontend nginx (`frontend/nginx.conf`) proxies `/api/`, `/_/`, and `/health` to `backend:8090`; all other paths fall back to the SPA via `try_files`.

## API endpoints
| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | health check |
| POST | `/api/game/new` | optional | start/resume a game; daily ignores client length/category (both random) and resumes in-progress daily games across the Helsinki midnight rollover (returns `day_changed`) |
| POST | `/api/game/daily/abandon` | optional | give up an in-progress previous-day daily game (recorded as a loss) and start today's |
| POST | `/api/game/guess` | optional | evaluate a guess; reveals `secret` + `definition_url` on game-over |
| GET | `/api/words/check?word=` | public | dictionary validity check |
| GET | `/api/game/stats` | bearer | aggregated player stats & streaks |
| `*` | `/_/*` | admin | PocketBase admin dashboard |

## Data model
- `users` (system collection): `id`, `username` (gamer tag), `email` (hidden — `emailVisibility = false`).
- `games`: `session_id`, `user` (relation, null for guests), `mode` (`daily`|`random`), `date_str` (`YYYY-MM-DD`), `length` (4–8), `category` (`all`|`substantiivi`|`adjektiivi`|`verbi`), `secret`, `pos`, `guesses_json` (serialized array of `{guess, evaluation}`), `attempts`, `max_attempts` (6), `won`, `finished`.
- `friendships`: `user_a`, `user_b` (relations), `status` (`pending`|`accepted`).

## Deployment & CI
- GitHub Actions (`.github/workflows/ci.yml`): on PR/push to `main`, `npm ci` + `npm run build` validates the frontend; on push to `main`, it builds and pushes backend/frontend images to GHCR with `latest` + short-sha tags.
- `compose.yaml` builds images locally for dev (frontend publishes :80→:8000; backend is internal-only).
- `compose.prod.yaml` pulls images from GHCR. A TLS-terminating reverse proxy (Caddy/Nginx) sits in front, routing `/api/*` and `/_/*` to the backend and everything else to the frontend.
- **Required env var:** the backend needs `DAILY_WORD_SECRET` (see `.env.example`) for the daily challenge; both compose files pass it through via `environment:` and the hook reads it with `$os.getenv`. The backend refuses to start a daily game if it is unset.
