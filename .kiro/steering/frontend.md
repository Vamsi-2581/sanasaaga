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
- Settings persist to `localStorage` under `sanakuutio_settings`; guest stats under `sanakuutio_stats` (daily games only, matching the server aggregate). Wrap all `localStorage` access in try/catch.
- An in-progress daily `session_id` is stored under `sanakuutio_daily_session` so reloads (and the Helsinki midnight rollover) resume the same game; it is cleared on game-over or give-up. The daily length is random and comes from the server — always set `length` from the `newGame`/`abandonDaily` response, never from the client pills (which are hidden in daily mode).
- Keyboard input is handled by a global `keydown` listener (added in `onMount`, removed in `onDestroy`); ignore input while a modal is open or when Ctrl/Meta/Alt modifiers are held.
- Only `a-zåäö` letters are accepted — the Finnish alphabet includes Å, Ä, Ö.

## Components
- New UI goes in `src/lib/components/` as `.svelte` files and is imported and mounted in `App.svelte`. Existing modals (`ModalHelp`, `ModalStats`, `ModalSettings`, `ModalAuth`) follow an `isOpen` + `onClose` prop pattern.
- The day-changed banner (`.day-changed-banner` in `App.svelte`) renders a give-up button when `day_changed` is true in daily mode; it calls `abandonDaily({ sessionId })` from `lib/api.js`.

## Audio (`lib/sounds.js`)
- Sounds are synthesized with the Web Audio API — do **not** add audio asset files. Gate playback on `sounds.enabled` (bound to the `sound` setting).

## Build & dev
- `npm run dev` runs Vite on :5173 with a proxy to PocketBase at `http://127.0.0.1:8090`. `npm run build` outputs to `frontend/dist/`, which the nginx container serves. Node 22 is required.
