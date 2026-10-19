"""
Sanadruidi - Suomenkielinen Wordle-sanapeli
FastAPI Backend
"""

import hashlib
import json
import random
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
WORDS_FILE = DATA_DIR / "words.json"

app = FastAPI(
    title="Sanadruidi",
    description="Suomenkielinen Wordle-sanapeli (4–8-kirjaimiset substantiivit, adjektiivit ja verbit)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load word dataset
if not WORDS_FILE.exists():
    raise RuntimeError(f"Word dataset not found at {WORDS_FILE}. Run scripts/prepare_words.py first.")

with open(WORDS_FILE, "r", encoding="utf-8") as f:
    RAW_DATA = json.load(f)

TARGETS: Dict[str, List[dict]] = RAW_DATA["targets"]
# Convert guesses lists to sets for O(1) lookup
GUESSES: Dict[str, set] = {k: set(v) for k, v in RAW_DATA["guesses"].items()}
# Also ensure all target words are in guesses
for k, targets_list in TARGETS.items():
    for t in targets_list:
        GUESSES[k].add(t["w"])

print(f"Loaded Sanadruidi dictionary:")
for length_str in sorted(TARGETS.keys(), key=int):
    print(f"  Length {length_str}: {len(TARGETS[length_str])} targets, {len(GUESSES[length_str])} valid guesses")


# In-memory session store (with light TTL / cleanup)
# session_id -> { "word": str, "pos": str, "length": int, "guesses": [], "max_attempts": 6, "mode": str }
SESSIONS: Dict[str, dict] = {}


class NewGameRequest(BaseModel):
    length: int = Field(default=5, ge=4, le=8)
    category: str = Field(default="all", pattern="^(all|substantiivi|adjektiivi|verbi)$")
    mode: str = Field(default="random", pattern="^(daily|random)$")
    date_str: Optional[str] = None


class GuessRequest(BaseModel):
    session_id: str
    guess: str


def evaluate_guess(guess: str, secret: str) -> List[str]:
    """
    Evaluates guess against secret word adhering to official Wordle letter coloring rules.
    Returns list of 'correct' (green), 'present' (yellow), 'absent' (gray).
    """
    n = len(guess)
    result = ["absent"] * n
    secret_counts = {}

    # 1st pass: exact matches
    for i in range(n):
        if guess[i] == secret[i]:
            result[i] = "correct"
        else:
            secret_counts[secret[i]] = secret_counts.get(secret[i], 0) + 1

    # 2nd pass: partial matches (present)
    for i in range(n):
        if result[i] != "correct":
            ch = guess[i]
            if secret_counts.get(ch, 0) > 0:
                result[i] = "present"
                secret_counts[ch] -= 1

    return result


def get_target_pool(length: int, category: str) -> List[dict]:
    pool = TARGETS.get(str(length), [])
    if category != "all":
        pool = [w for w in pool if w["pos"] == category]
    if not pool:
        # Fallback to all for that length
        pool = TARGETS.get(str(length), [])
    return pool


def pick_target(length: int, category: str, mode: str, date_str: Optional[str]) -> dict:
    pool = get_target_pool(length, category)
    if not pool:
        raise ValueError(f"No target words found for length={length}, category={category}")

    if mode == "daily":
        d = date_str or date.today().isoformat()
        seed_str = f"{d}-{length}-{category}"
        h = int(hashlib.sha256(seed_str.encode("utf-8")).hexdigest(), 16)
        # Select among the top common words (first 500 or entire pool if smaller)
        top_slice = pool[:min(len(pool), 600)]
        return top_slice[h % len(top_slice)]
    else:
        # For random mode, prioritize fairly common words (top 70%), but allow diversity
        cutoff = max(10, int(len(pool) * 0.7))
        top_pool = pool[:cutoff]
        return random.choice(top_pool)


@app.get("/health")
def health_check():
    return {"status": "ok", "app": "Sanadruidi", "version": "1.0.0"}


@app.post("/api/game/new")
def new_game(req: NewGameRequest):
    length = req.length
    category = req.category
    mode = req.mode
    date_str = req.date_str or date.today().isoformat()

    target_obj = pick_target(length, category, mode, date_str)
    word = target_obj["w"]
    pos = target_obj["pos"]

    # Generate session ID
    session_id = hashlib.sha256(f"{word}-{random.random()}-{date_str}".encode("utf-8")).hexdigest()[:16]

    SESSIONS[session_id] = {
        "word": word,
        "pos": pos,
        "length": length,
        "category": category,
        "mode": mode,
        "date_str": date_str,
        "guesses": [],
        "max_attempts": 6,
        "finished": False
    }

    # Limit memory cache size
    if len(SESSIONS) > 10000:
        # Remove oldest 1000
        keys_to_remove = list(SESSIONS.keys())[:1000]
        for k in keys_to_remove:
            del SESSIONS[k]

    return {
        "session_id": session_id,
        "length": length,
        "category": category,
        "mode": mode,
        "date_str": date_str,
        "max_attempts": 6,
        "pos": pos,  # Part of speech
    }


@app.post("/api/game/guess")
def submit_guess(req: GuessRequest):
    session = SESSIONS.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Pelisessiota ei löytynyt. Aloita uusi peli.")

    if session["finished"]:
        raise HTTPException(status_code=400, detail="Peli on jo päättynyt.")

    guess = req.guess.strip().lower()
    length = session["length"]
    secret = session["word"]

    if len(guess) != length:
        raise HTTPException(status_code=400, detail=f"Sanan on oltava {length} kirjainta pitkä.")

    # Validate against dictionary
    valid_set = GUESSES.get(str(length), set())
    if guess not in valid_set:
        return {
            "valid": False,
            "error": "Sanaa ei löydy suomen kielen sanakirjasta.",
            "guess": guess
        }

    evaluation = evaluate_guess(guess, secret)
    session["guesses"].append({
        "guess": guess,
        "evaluation": evaluation
    })

    attempts_count = len(session["guesses"])
    is_win = (guess == secret)
    is_game_over = is_win or (attempts_count >= session["max_attempts"])

    if is_game_over:
        session["finished"] = True

    response_data = {
        "valid": True,
        "guess": guess,
        "evaluation": evaluation,
        "attempt": attempts_count,
        "max_attempts": session["max_attempts"],
        "is_win": is_win,
        "is_game_over": is_game_over,
        "pos": session["pos"]
    }

    if is_game_over:
        response_data["secret"] = secret
        response_data["definition_url"] = f"https://www.kielitoimistonsanakirja.fi/#/{secret}"

    return response_data


@app.get("/api/words/check")
def check_word(word: str = Query(..., min_length=1, max_length=15)):
    w = word.strip().lower()
    l_str = str(len(w))
    is_valid = w in GUESSES.get(l_str, set())
    return {"word": w, "valid": is_valid, "length": len(w)}


# Mount static assets
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "web" / "static")), name="static")


@app.get("/")
def get_index():
    return FileResponse(BASE_DIR / "web" / "templates" / "index.html")
