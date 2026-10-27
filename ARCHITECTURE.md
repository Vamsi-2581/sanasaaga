# 🏛 Sanasaaga - System Architecture

This document describes the system architecture, component boundaries, data models, network topology, and privacy design of **Sanasaaga**.

---

## 1. Overview and Core Principles

Sanasaaga is a Finnish Wordle-style word game designed for lightweight, reliable hosting on container-based environments and home servers.

### Core Architectural Principles:
1. **Ultra-Low Resource Footprint**: The entire stack (frontend + backend + database) consumes less than **90 MB of RAM**.
2. **Decoupled Client-Server Model**: Frontend and backend run in isolated Podman containers. The backend exposes a standard REST/JSON API, enabling future native mobile clients (React Native, Flutter, Swift) without backend refactoring.
3. **Privacy by Design**: We store zero personally identifiable information (no email addresses, no real names). Google OAuth serves purely as an identity anchor; players are automatically assigned random Finnish animal gamer tags.
4. **Server-Side Game Logic (Anti-Cheat)**: Secret words are strictly kept server-side and never sent to the browser until a game round concludes.

---

## 2. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Client ["Player Device (Browser / Mobile PWA)"]
        UI["Svelte 5 SPA Interface"]
        Audio["Web Audio API Sound Engine"]
        Storage["Local Storage (localStorage)"]
    end

    subgraph Server ["Server Host Environment (Podman)"]
        subgraph Gateway ["Reverse Proxy"]
            Proxy["Reverse Proxy (Ports 80 & 443 HTTPS)"]
        end

        subgraph FrontendContainer ["Frontend Container (nginx:alpine, ~13 MB)"]
            StaticFiles["Compiled Static Assets (HTML, CSS, JS)"]
        end

        subgraph BackendContainer ["Backend Container (PocketBase, ~70 MB)"]
            PB["PocketBase v0.25+ Server"]
            Engine["Game Engine (game_engine.js)"]
            Routes["Custom API Routes (game.pb.js)"]
            AuthHook["Privacy Hook (users.pb.js)"]
            Words["Kotus Vocabulary (words.js, 25k+ words in-memory)"]
            SQLite[("Embedded SQLite (pb_data)")]
        end
    end

    UI -->|HTTPS Requests| Proxy
    Proxy -->|/| StaticFiles
    Proxy -->|/api/* & /_/*| PB
    PB --> Routes
    Routes --> Engine
    Engine --> Words
    Routes --> SQLite
    AuthHook --> SQLite
```

---

## 3. Component Details

### 3.1 Frontend (`frontend/`)
A responsive, high-performance Single Page Application (SPA):
* **Framework**: **Svelte 5** (Runes-based reactivity: `$state`, `$derived`, `$effect`) bundled with **Vite 8**.
* **Bundle Size**: ~34 KB gzipped JavaScript total, including the PocketBase SDK and reactive state.
* **Key Components**:
  * [`Board.svelte`](frontend/src/lib/components/Board.svelte): Adaptive 4–8 letter word grid with pop, flip, and shake animations.
  * [`Keyboard.svelte`](frontend/src/lib/components/Keyboard.svelte): Full Finnish keyboard layout (`Å`, `Ä`, `Ö`) with evaluation color states.
  * [`ModalAuth.svelte`](frontend/src/lib/components/ModalAuth.svelte): Google OAuth sign-in, profile viewing, and anonymous gamer tag management.
  * [`ModalStats.svelte`](frontend/src/lib/components/ModalStats.svelte): Win rate, streaks, guess distribution chart (1–6), Kielitoimiston sanakirja definition button, and Wordle emoji share feature (🟩🟨⬛).
  * [`ModalSettings.svelte`](frontend/src/lib/components/ModalSettings.svelte): Theme selection (dark/light), high-contrast accessibility mode, and part-of-speech hint toggles.
* **Audio Synthesizer ([`sounds.js`](frontend/src/lib/sounds.js))**: Generates sound effects synthetically via the browser's Web Audio API (0 KB audio file downloads).
* **PWA & Mobile Ready**: Includes [`manifest.json`](frontend/public/manifest.json) enabling full-screen standalone installation on mobile devices.

### 3.2 Backend (`backend/`)
A single-binary **PocketBase** application (Go + Goja JSVM runtime hooks):
* **Why PocketBase over Supabase?**
  * Supabase runs 10–14 containers and consumes 1.5–2 GB RAM at idle.
  * PocketBase runs as a single lightweight binary with embedded SQLite, idling at ~35–70 MB RAM.
* **Finnish Dictionary ([`pb_hooks/words.js`](backend/pb_hooks/words.js))**:
  * Over 25,000 valid Finnish words derived from Kotus and Voikko databases.
  * Loaded into memory sets on startup for $O(1)$ constant-time validation.
* **Wordle Game Logic ([`pb_hooks/game_engine.js`](backend/pb_hooks/game_engine.js))**:
  * Official two-pass letter coloring algorithm (`correct`, `present`, `absent`).
  * Daily word selection: one word per Helsinki day, identical for everyone. Both the length (4–8) and the word class are random, drawn across the whole dictionary. Seed = `DAILY_WORD_SECRET` (env var) + `:` + Helsinki date → `SHA-256`; the first 8 hex chars select the length, the next 8 hex chars index into the top-600 most-frequent words of that length. The secret is read via `$os.getenv` and never leaves the server, so the daily word can't be reconstructed from the dictionary alone.
  * Free play: random pick from the top 70% most-frequent words of the chosen length/category.
  * Helsinki date is derived from the UTC clock with EU DST handling (EET=UTC+2 / EEST=UTC+3), so the daily rollover is correct regardless of the container's timezone.

---

## 4. API Specification

| Method | Route | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server health check | Public |
| `POST` | `/api/game/new` | Start or resume a game. Daily mode ignores client length/category (both random) and resumes in-progress daily games across the Helsinki midnight rollover (returns `day_changed`). | Optional (resumes daily game if authenticated) |
| `POST` | `/api/game/daily/abandon` | Give up an in-progress daily game from a previous day (recorded as a loss) and start today's. | Optional |
| `POST` | `/api/game/guess` | Evaluates guess and returns tile statuses. Reveals secret upon game over. | Optional |
| `GET` | `/api/words/check?word=` | Validates whether a word exists in the Finnish dictionary | Public |
| `GET` | `/api/game/stats` | Fetches aggregated player statistics and streaks | Yes (Bearer Token) |
| `*` | `/_/*` | PocketBase Administrative Dashboard | PocketBase Admin |

---

## 5. Data Model & Privacy Design

### 5.1 Database Collections (SQLite)

#### `users` (System Collection)
* `id`: Unique user UUID
* `username`: Gamer handle (e.g. `Kettu412`, editable by player)
* `email`: Hidden from public API queries (`emailVisibility = false`)

#### `games`
Stores game sessions, active state, and historical records:
* `session_id`: Unique 24-character session key
* `user`: Relation -> `users` (null for guest players)
* `mode`: `"daily"` or `"random"`
* `date_str`: Date string `"YYYY-MM-DD"`
* `length`: Word length (4–8)
* `category`: Part of speech (`"all"`, `"substantiivi"`, `"adjektiivi"`, `"verbi"`)
* `secret`: Hidden target word (secured from client inspection)
* `guesses_json`: Serialized JSON array of guesses and evaluation arrays
* `attempts`: Number of guesses made (0–6)
* `won`: Boolean
* `finished`: Boolean

#### `friendships`
Player social connections for daily challenge comparisons:
* `user_a`: Relation -> `users`
* `user_b`: Relation -> `users`
* `status`: `"pending"` or `"accepted"`

### 5.2 Privacy Architecture (OAuth Privacy Hook)
In [`backend/pb_hooks/users.pb.js`](backend/pb_hooks/users.pb.js), the user registration lifecycle hook ensures:
1. Google's real name is stripped (`name = ""`).
2. Email visibility is forced to private (`emailVisibility = false`).
3. If no username is provided, a randomized Finnish animal gamer tag is generated (`Kettu`, `Ilves`, `Karhu`, `Susi`, `Ahma`, `Norppa`, `Hirvi`, `Metso`, `Kuukkeli`, `Siili`, `Saukko`, `Pöllö` + 3-digit random number).
4. Players can change their gamer tag at any time in their profile settings.

---

## 6. Production Deployment & Reverse Proxy

In production, an SSL-terminating reverse proxy (typically **Caddy**) sits in front of the application, handling automated HTTPS on port 443 and forwarding plain HTTP to the stack. The stack has a **single public entry point**: the frontend Nginx container (published as `8000:80`). Nginx itself fans `/api/*`, `/_/*`, and `/health` out to the backend container internally, so the reverse proxy never needs to know about PocketBase (`:8090`) or split routes — it just forwards everything for the host to the frontend.

```
[ Player Browser / Mobile Client ]
            │  HTTPS (443)
            ▼
[ Reverse Proxy (Caddy) ]  ──HTTP──>  Frontend Container (Nginx :80, published :8000)
                                             ├── /              ──> SPA static assets
                                             └── /api/*, /_/*, /health ──> Backend (PocketBase :8090)
```

### 6.1 Co-located Caddy (single machine)

When Caddy runs on the same host as the stack, it can target the published port on localhost:

```caddy
sanasaaga.fi {
    reverse_proxy localhost:8000
}
```

### 6.2 Remote Caddy fronting multiple domains / machines

Caddy can also run on a **separate** machine and route different domains to different backend hosts — useful when one gateway serves several services. Example: a Caddy gateway on the **gaiafm** machine terminates HTTPS for both `gaiafm.org` (local) and `sanasaaga.fi` (on the separate **sanasaaga** machine).

```
                          ┌──────────────────────────────────────────┐
  Browser ──HTTPS:443──>  │  gaiafm machine: Caddy                    │
                          │   ├── gaiafm.org   ──HTTP──> local app     │
                          │   └── sanasaaga.fi ──HTTP──> SANASAAGA_IP:8000
                          └──────────────────────────────────────────┘
                                                      │ HTTP (private link)
                                                      ▼
                          sanasaaga machine: frontend container (:8000) ─> backend (:8090)
```

Caddyfile on the gateway machine (`SANASAAGA_IP` = the sanasaaga machine's address reachable from the gateway):

```caddy
gaiafm.org {
    reverse_proxy localhost:PORT        # the local gaiafm app
}

sanasaaga.fi {
    # Single entry point: the frontend container on the sanasaaga machine.
    # Do NOT split /api or /_ here — the frontend Nginx already does that.
    reverse_proxy SANASAAGA_IP:8000
}
```

Caddy automatically provisions and renews Let's Encrypt certificates for both domains (each domain's DNS must point at the gateway machine's public IP).

**Operational requirements for the remote-Caddy setup:**
1. **Expose the frontend port to the gateway.** The compose files publish `8000:80`, which binds `0.0.0.0:8000` on the sanasaaga machine, so it is reachable on the LAN. Restrict it: allow inbound TCP `8000` **only from the gateway machine's IP**, e.g. `sudo ufw allow from GAIAFM_IP to any port 8000 proto tcp`. Port 8000 carries plain HTTP, so it must never be open to the public internet.
2. **Secure the HTTP leg.** Traffic from the gateway to the sanasaaga machine is unencrypted. Run it over a trusted private link (WireGuard/VPN or a private VLAN). In this deployment the gaiafm machine can reach the sanasaaga machine (not vice-versa), which fits a one-way private route.
3. **Forwarded headers.** Caddy's `reverse_proxy` sets `X-Forwarded-Proto: https`, `X-Forwarded-For`, and `X-Forwarded-Host`. The frontend `nginx.conf` already forwards these to PocketBase, so the backend sees the original HTTPS scheme and client IP across both hops. No change needed.
4. **Set the PocketBase application URL** to the public HTTPS origin (`https://sanasaaga.fi`) so OAuth redirect URLs and emails use the correct scheme/host even though the hop to the backend is HTTP — see §6.3.

### 6.3 Setting the PocketBase application URL

Because HTTPS is terminated at Caddy and the backend is reached over HTTP, PocketBase must be told its public origin so it builds correct `https://sanasaaga.fi/...` OAuth redirect URLs. Set it once via the Admin UI:

1. Open the Admin UI at `https://sanasaaga.fi/_/` (through Caddy) and log in as the superuser.
2. Go to **Settings → Application**.
3. Set **Application URL** to `https://sanasaaga.fi` and save.

Also update the Google OAuth provider's authorized redirect URI to `https://sanasaaga.fi/api/oauth2-redirect` (Settings → Auth providers → Google), and register the same URI in the Google Cloud console. If OAuth callbacks ever come back as `http://`, the application URL is wrong or the `X-Forwarded-Proto` header is not reaching PocketBase.

---

## 7. CI/CD Automation (GitHub Actions)

Automated continuous deployment workflow:
1. **GitHub Actions Workflow**:
   * Pushes to `main` trigger a container build job.
   * Container images are published to GitHub Container Registry (`ghcr.io/username/sanasaaga-frontend:latest` and `backend:latest`).
2. **Production Deployment**:
   * **Self-hosted GitHub Runner (Recommended)**: A runner inside the production VM connects outbound to GitHub, pulls the latest images from `ghcr.io`, and executes `podman-compose -f compose.prod.yaml up -d`.
   * **Alternative (Watchtower)**: A background daemon monitoring image tags for automated redeployment.
