# 🌿 Sanasaaga - Finnish Wordle

**Sanasaaga** is a modern Finnish Wordle word game.
The project is built as a decoupled microservices architecture:
* **Frontend**: Svelte 5 + Vite (packaged into an ultra-lightweight `nginx:alpine` container, ~13 MB RAM).
* **Backend**: PocketBase (Go + embedded SQLite + OAuth2 + game engine as JS hooks, ~70 MB RAM).

The entire stack consumes less than **85 MB of memory**, making it ideal for low-spec environments and home servers.

---

## ✨ Features

- **Word Length** (Free Play): Choose any word length between **4–8 letters** (default 5, classic Wordle). The daily challenge length is random.
- **Parts of Speech** (Free Play): Filter target words by part of speech (**All**, **Nouns**, **Adjectives**, or **Verbs**). The daily challenge draws from all classes.
- **Daily Challenge & Free Play**:
  - **Daily Word**: One word per day, identical for every player. The word length (4–8) and word class (noun, adjective or verb) are both random, drawn from the whole dictionary. A server-side secret (`DAILY_WORD_SECRET` env var) is mixed into the SHA-256 seed so the word cannot be reconstructed even with the dictionary. The word changes only at midnight **Helsinki time** (with DST) — after you finish the daily, it keeps showing that day's word and result until the rollover. An in-progress game can be finished past midnight, or given up to start the new day's word.
  - **Free Play**: Play unlimited rounds with random words; choose any word length (4–8) and optionally filter by part of speech. Each length is a separate game that persists until finished — switch between lengths (or over to the daily and back) without losing progress, and keep up to five free games going at once. Your chosen length is remembered when you pop over to the daily and back. A reset button (with confirmation) discards the current unfinished game of a length and deals a new word.
- **High-Quality Vocabulary**:
  - Over **25,000 valid Finnish words**.
  - Sourced from the Institute for the Languages of Finland ([Kotus](https://kaino.kotus.fi/sanat/nykysuomi/)) Contemporary Finnish Wordlist and Voikko's [Joukahainen](https://joukahainen.puimula.org/) morphology database.
- **Dictionary Integration**: At the end of a round, open the official definition directly in Kotus's Kielitoimiston sanakirja with one click.
- **User Accounts & Privacy by Design**:
  - Optional Google OAuth login.
  - **Zero personal data stored**: We do not store user email addresses or real names. The system automatically assigns a random, anonymous Finnish animal gamer tag (e.g. *Kettu412* or *Ilves809*), which players can customize.
  - Guest mode available without registration (stats saved locally in `localStorage`).
- **Design & Accessibility**:
  - Dark and Light themes.
  - High-contrast mode (orange and blue for colorblind accessibility).
  - Web Audio API synthetic sound effects (zero audio file downloads).
  - PWA (Progressive Web App): Installable directly to mobile home screens.

---

## 🚀 Running with Podman

> **Required env var:** The daily challenge needs `DAILY_WORD_SECRET`. Copy `.env.example` to `.env` and set a long random string, or `export DAILY_WORD_SECRET=...` in your shell before starting the stack. The backend refuses to start a daily game if it is unset.

### Option A: Using the Runner Script (Easiest)
```bash
./run.sh
```

### Option B: Using Podman Compose
```bash
podman-compose up -d
# or
podman compose up -d
```

Open the game in your browser:
👉 **[http://localhost:8000](http://localhost:8000)**

The PocketBase Admin UI is available at:
👉 **[http://localhost:8000/_/](http://localhost:8000/_/)**

To stop the containers:
```bash
podman-compose down
```

---

## 🛠 Local Development (Without Containers)

If you want to run the frontend and backend directly on your host machine:

### 1. Start Backend (PocketBase)
```bash
cd backend
DAILY_WORD_SECRET=your-secret-here ./pocketbase serve --http=127.0.0.1:8090
```

### 2. Start Frontend (Svelte 5 + Vite)
```bash
cd frontend
npm install
npm run dev
```
The Vite development server opens at `http://localhost:5173` and automatically proxies `/api/*` and `/_/*` requests to the local PocketBase instance.

---

## 📂 Project Structure

```
sanasaaga/
├── backend/
│   ├── Containerfile          # Alpine + PocketBase container definition (~22 MB)
│   ├── pb_hooks/
│   │   ├── init.pb.js         # Automatic database schema bootstrapper (games, friendships)
│   │   ├── users.pb.js        # OAuth privacy hook: strips real names & assigns animal tags
│   │   ├── game_engine.js     # Finnish Wordle engine and validation rules
│   │   ├── game.pb.js         # Game API routes (/api/game/*, /api/words/check)
│   │   └── words.js           # 25k+ Kotus wordlist loaded in-memory
│   └── scripts/
│       └── export_words.py    # Utility script to export words.json -> words.js
├── frontend/
│   ├── Containerfile          # Multi-stage build definition (Node -> Nginx:alpine)
│   ├── nginx.conf             # Nginx server + SPA routing + internal API proxy
│   ├── src/
│   │   ├── App.svelte         # Main game state orchestrator
│   │   ├── app.css            # Responsive themes (dark, light, high contrast)
│   │   ├── lib/
│   │   │   ├── api.js         # PocketBase client & API requests
│   │   │   ├── sounds.js      # Web Audio API sound synthesizer
│   │   │   └── components/    # Svelte components (Board, Keyboard, Modals, etc.)
│   │   └── main.js            # Svelte 5 application entry point
│   └── package.json
├── data/
│   └── words.json             # Source parsed Kotus dictionary
├── old/                       # Archived Python FastAPI proof-of-concept
├── compose.yaml               # Container compose definition
├── compose.prod.yaml          # Production compose definition (pulls from GHCR)
├── run.sh                     # Podman execution script
├── ARCHITECTURE.md            # System architecture and technical documentation
└── README.md
```

---

## 📚 Updating the Vocabulary

To update or regenerate the Kotus wordlist from upstream sources:

```bash
python3 scripts/prepare_words.py
```

This script automatically downloads:
1. The Kotus Contemporary Finnish Wordlist (XML & text).
2. Voikko's Joukahainen morphology database for parts of speech (nouns, adjectives, verbs).
3. Finnish 50k word frequency lists.
And generates an optimized `data/words.json` file.
