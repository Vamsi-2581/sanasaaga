---
inclusion: fileMatch
fileMatchPattern: 'frontend/**'
---
# Frontend Conventions (Svelte 5)

Svelte 5 SPA bundled with Vite. Uses Runes exclusively — no Svelte 4 reactivity (`export let`, `$:`, stores unless already in use).

## Code style
- 2-space indentation, single quotes for strings, **semicolons used** (match `lib/api.js` and `App.svelte`).
- No ESLint/Prettier is configured; CI only runs `npm run build`. Match the surrounding style manually.
- Component file order: `<script>`, then markup, then `<style>` (if any). Most shared visual styles live in `src/app.css` and are themed via CSS variables toggled by `data-theme` and `data-contrast` attributes on `<html>`.
- User-facing strings are in **Finnish**.

## Svelte 5 Runes
- State: `let x = $state(init)`. Derived: `const y = $derived(...)`. Side effects: `$effect(() => { ... })`.
- Props: `let { length = 5, guesses = [] } = $props();`.
- Event handlers use Svelte 5 lowercase attribute syntax: `onclick={...}` (not `on:click`).
- Use `{#each}`, `{#if}`, and `{@const}` for local consts inside blocks, as in `Board.svelte`.

## API client (`lib/api.js`)
- PocketBase client: `new PocketBase(window.location.origin)` — same-origin in production because nginx proxies `/api`, `/_`, `/health` to the backend container.
- For custom routes, use `fetch` with `Content-Type: application/json` and an `Authorization: Bearer <token>` header when `pb.authStore.token` exists.
- On non-OK responses, throw `new Error(err.error || 'Finnish fallback message')`.

## State & persistence (`App.svelte`)
- `App.svelte` is the single orchestrator: holds game state, settings, stats, and modal open-flags, then passes props down to components. Keep components presentational; put logic in `App.svelte` and `lib/*.js`.
- Settings persist to `localStorage` under `sanasaaga_settings`; guest stats under `sanasaaga_stats` (daily games only, matching the server aggregate). Wrap all `localStorage` access in try/catch.
- In-progress game sessions are tracked in a `localStorage` map under `sanasaaga_sessions` (JSON `{ "daily": sid, "random:5": sid, ... }`), one slot per playable game: the daily plus one free game per length (4–8). `initGame` sends the current slot's `session_id` so switching length or toggling daily↔free resumes the right game instead of discarding it. Migrated once from the old single `sanasaaga_daily_session` key. Always set `length` from the `newGame`/`abandonDaily`/`resetRandom` response (daily length is random and server-chosen), never from the client pills.
- Slot-clearing differs by mode (`applyGameData`): a **free** slot is cleared on game-over (so the next visit to that length deals a new word) and on reset; the **daily** slot is kept even when finished, so re-entering daily or reloading shows the completed result (same word) until the Helsinki midnight rollover — the server stops resuming it once the date changes.
- The free-play length the player last chose is remembered in `sanasaaga_free_length` (`freeLength` state) and restored when switching daily→free, since daily mode overwrites `length` with its server-chosen value.
- Free play has a reset button (`.reset-btn`) that calls `resetRandom({ length, category, sessionId })` to discard the current unfinished game of that length and start a new one. It asks for confirmation (native `confirm`) only when there is progress to lose (unfinished game with ≥1 guess).
- Keyboard input is handled by a global `keydown` listener (added in `onMount`, removed in `onDestroy`); ignore input while a modal is open or when Ctrl/Meta/Alt modifiers are held.
- Only `a-zåäö` letters are accepted — the Finnish alphabet includes Å, Ä, Ö.

## Components
- New UI goes in `src/lib/components/` as `.svelte` files and is imported and mounted in `App.svelte`. Existing modals (`ModalHelp`, `ModalStats`, `ModalSettings`, `ModalAuth`) follow an `isOpen` + `onClose` prop pattern.
- The day-changed banner (`.day-changed-banner` in `App.svelte`) renders a give-up button when `day_changed` is true in daily mode; it calls `abandonDaily({ sessionId })` from `lib/api.js`.

## Audio (`lib/sounds.js`)
- Sounds are synthesized with the Web Audio API — do **not** add audio asset files. Gate playback on `sounds.enabled` (bound to the `sound` setting).

## Build & dev
- `npm run dev` runs Vite on :5173 with a proxy to PocketBase at `http://127.0.0.1:8090`. `npm run build` outputs to `frontend/dist/`, which the nginx container serves. Node 22 is required.
