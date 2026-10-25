---
inclusion: always
---
# Sanakuutio — Product & Design Principles

## What it is
A Finnish-language Wordle clone. Players guess a hidden Finnish word (4–8 letters, default 5) in up to 6 tries. Tiles color as `correct` (green), `present` (yellow), or `absent` (gray).

## Core features
- **Daily challenge**: one word per Helsinki day, identical for everyone; the length (4–8) and word class are random, drawn across the whole dictionary. The seed mixes a server-side secret (`DAILY_WORD_SECRET` env var) with the Helsinki date → `SHA-256`, so the word can't be reconstructed from the dictionary alone. The word rolls over at midnight Helsinki time (with DST); an in-progress daily game can be finished past midnight, or given up (counted as a loss) to start the new day's word.
- **Free play**: unlimited random words; choose length (4–8, default 5) and a part-of-speech filter (all / nouns `substantiivi` / adjectives `adjektiivi` / verbs `verbi`).
- **25,000+ Finnish words** from Kotus + Voikko's Joukahainen. A one-click link opens the official definition in Kielitoimiston sanakirja after a round.
- **Optional Google OAuth**; guest mode persists stats to `localStorage`. Anonymous Finnish animal gamer tags (e.g. `Kettu412`), editable by the player.
- **Themes**: dark/light + high-contrast (orange/blue) for colorblind accessibility. **Synthetic Web Audio sounds** (zero audio file downloads). **PWA**: installable to mobile home screens.
- **Share**: Wordle-style emoji grid (🟩🟨⬛) copied to clipboard.

## Non-negotiable design principles
1. **Privacy by design — store zero PII.** No emails or real names are exposed. The OAuth hook strips the real name, forces `emailVisibility = false`, and assigns a random Finnish animal gamer tag when the username is missing or equals the email prefix. Never log or return email/name in API responses.
2. **Server-side game logic — anti-cheat.** The secret word stays server-side and is NEVER sent to the client until the round is over (`is_game_over`). Guess validity and evaluation are authoritative on the server; the client only renders the results it receives. The daily word's seed includes a server-side secret (`DAILY_WORD_SECRET` env var) so it can't be reconstructed from the dictionary; the backend refuses to start a daily game if that var is unset.
3. **Ultra-low footprint.** Frontend is ~34 KB gzipped; the whole stack is under 90 MB RAM. Avoid heavy dependencies; prefer zero-dependency solutions (e.g. synthesized audio over audio files, single-binary PocketBase over multi-container Supabase).
4. **Finnish-language UI.** All user-facing strings (toasts, errors, buttons, labels) are in Finnish. Code identifiers and internal comments may be English.
5. **Decoupled client-server.** The backend exposes a plain REST/JSON API so future native clients need no backend changes. Keep the frontend loosely coupled to PocketBase — use it for auth and the custom `/api/*` routes, not for direct collection access beyond what the hooks allow.
