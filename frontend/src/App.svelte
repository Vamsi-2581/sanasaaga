<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    pb,
    newGame,
    submitGuess,
    checkWord,
    getStats,
    loginWithGoogle,
    logout as pbLogout,
    updateUsername as pbUpdateUsername,
    abandonDaily as pbAbandonDaily
  } from './lib/api.js';
  import { sounds } from './lib/sounds.js';

  import Header from './lib/components/Header.svelte';
  import Board from './lib/components/Board.svelte';
  import Keyboard from './lib/components/Keyboard.svelte';
  import Toast from './lib/components/Toast.svelte';
  import ModalHelp from './lib/components/ModalHelp.svelte';
  import ModalStats from './lib/components/ModalStats.svelte';
  import ModalSettings from './lib/components/ModalSettings.svelte';
  import ModalAuth from './lib/components/ModalAuth.svelte';

  // Game Settings & State
  let length = $state(5);
  let category = $state('all');
  let mode = $state('daily'); // 'daily' | 'random'
  let sessionId = $state('');
  let pos = $state('');
  let guesses = $state([]);
  let currentGuess = $state('');
  let isGameOver = $state(false);
  let isWin = $state(false);
  let secret = $state('');
  let definitionUrl = $state('');
  let dayChanged = $state(false);
  let isSubmitting = $state(false);
  let shakeRow = $state(-1);
  let keyStatuses = $state({});

  // User & Stats
  let user = $state(pb.authStore.record);
  let stats = $state({
    played: 0,
    wins: 0,
    win_rate: 0,
    current_streak: 0,
    max_streak: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  });

  // Settings
  let settings = $state({
    theme: 'dark',
    contrast: 'normal',
    sound: true,
    hints: false
  });

  // Modals & Toasts
  let isHelpOpen = $state(false);
  let isStatsOpen = $state(false);
  let isSettingsOpen = $state(false);
  let isAuthOpen = $state(false);
  let toasts = $state([]);

  function addToast(text, duration = 2500) {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, text }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, duration);
  }

  function applySettings(newSettings) {
    settings = newSettings;
    sounds.enabled = settings.sound;
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-contrast', settings.contrast);
    try {
      localStorage.setItem('sanasaaga_settings', JSON.stringify(settings));
    } catch (e) {}
  }

  function loadLocalSettings() {
    try {
      const saved = localStorage.getItem('sanasaaga_settings');
      if (saved) {
        applySettings({ ...settings, ...JSON.parse(saved) });
      } else {
        applySettings(settings);
      }
    } catch (e) {
      applySettings(settings);
    }
  }

  function loadLocalStats() {
    try {
      const saved = localStorage.getItem('sanasaaga_stats');
      if (saved) {
        stats = { ...stats, ...JSON.parse(saved) };
      }
    } catch (e) {}
  }

  function saveLocalStats(won, attemptCount) {
    const next = { ...stats };
    next.played++;
    if (won) {
      next.wins++;
      next.current_streak++;
      if (next.current_streak > next.max_streak) {
        next.max_streak = next.current_streak;
      }
      next.distribution[attemptCount] = (next.distribution[attemptCount] || 0) + 1;
    } else {
      next.current_streak = 0;
    }
    next.win_rate = Math.round((next.wins / next.played) * 100);
    stats = next;
    try {
      localStorage.setItem('sanasaaga_stats', JSON.stringify(stats));
    } catch (e) {}
  }

  // --- Daily challenge session persistence (guest resume + midnight rollover) ---
  // While a daily game is in progress, its session_id is tracked here so a
  // reload (including across the Helsinki midnight rollover) resumes the same
  // game instead of starting a new one. Cleared when the game ends or is given up.
  function loadDailySessionId() {
    try {
      return localStorage.getItem('sanasaaga_daily_session') || null;
    } catch (e) {
      return null;
    }
  }
  function saveDailySessionId(id) {
    try {
      if (id) localStorage.setItem('sanasaaga_daily_session', id);
      else localStorage.removeItem('sanasaaga_daily_session');
    } catch (e) {}
  }

  async function fetchServerStats() {
    if (user) {
      const serverStats = await getStats();
      if (serverStats) {
        stats = serverStats;
      }
    }
  }

  function updateKeyStatuses(newGuesses) {
    const map = {};
    for (const g of newGuesses) {
      for (let i = 0; i < g.guess.length; i++) {
        const letter = g.guess[i];
        const status = g.evaluation[i]; // 'correct', 'present', 'absent'
        const current = map[letter];
        if (current === 'correct') continue;
        if (current === 'present' && status !== 'correct') continue;
        map[letter] = status;
      }
    }
    keyStatuses = map;
  }

  async function initGame() {
    try {
      currentGuess = '';
      isGameOver = false;
      isWin = false;
      secret = '';
      definitionUrl = '';
      dayChanged = false;
      keyStatuses = {};

      // In daily mode, resume the tracked in-progress session if there is one
      // (lets guests and authed players continue across reloads and midnight).
      const resumeId = mode === 'daily' ? loadDailySessionId() : null;

      const gameData = await newGame({
        length,
        category,
        mode,
        session_id: resumeId
      });

      sessionId = gameData.session_id;
      // Daily mode picks a random length server-side; always trust the server.
      length = gameData.length || length;
      pos = gameData.pos || '';
      guesses = gameData.guesses || [];
      isGameOver = gameData.finished || false;
      isWin = gameData.won || false;
      dayChanged = !!gameData.day_changed;
      if (gameData.secret) {
        secret = gameData.secret;
        definitionUrl = gameData.definition_url || '';
      }
      updateKeyStatuses(guesses);

      // Track the active daily session only while the game is in progress.
      if (mode === 'daily' && !isGameOver) {
        saveDailySessionId(sessionId);
      } else if (mode === 'daily') {
        saveDailySessionId(null);
      }
    } catch (err) {
      addToast(err.message || 'Pelin alustus epäonnistui');
    }
  }

  async function giveUpDaily() {
    if (!sessionId || isSubmitting) return;
    isSubmitting = true;
    try {
      const gameData = await pbAbandonDaily({ sessionId });

      sessionId = gameData.session_id;
      length = gameData.length || length;
      pos = gameData.pos || '';
      guesses = gameData.guesses || [];
      currentGuess = '';
      isGameOver = false;
      isWin = false;
      secret = '';
      definitionUrl = '';
      dayChanged = false;
      keyStatuses = {};
      updateKeyStatuses(guesses);

      if (mode === 'daily') {
        saveDailySessionId(isGameOver ? null : sessionId);
      }
      addToast('Uusi päivän sana aloitettu');
    } catch (err) {
      addToast(err.message || 'Pelin peruutus epäonnistui');
    } finally {
      isSubmitting = false;
    }
  }

  async function onKeyPress(k) {
    if (isGameOver || isSubmitting) return;

    if (k === 'Backspace') {
      if (currentGuess.length > 0) {
        currentGuess = currentGuess.slice(0, -1);
        sounds.playDelete();
      }
      return;
    }

    if (k === 'Enter') {
      if (currentGuess.length !== length) {
        shakeCurrentRow();
        addToast(`Sanan on oltava ${length} kirjainta pitkä!`);
        sounds.playError();
        return;
      }
      await handleGuess();
      return;
    }

    // Single letter check (support Å, Ä, Ö)
    if (/^[a-zåäöA-ZÅÄÖ]$/.test(k)) {
      if (currentGuess.length < length) {
        currentGuess += k.toLowerCase();
        sounds.playKey();
      }
    }
  }

  function shakeCurrentRow() {
    shakeRow = guesses.length;
    setTimeout(() => {
      shakeRow = -1;
    }, 500);
  }

  async function handleGuess() {
    isSubmitting = true;
    try {
      const res = await submitGuess({
        sessionId,
        guess: currentGuess
      });

      if (!res.valid) {
        shakeCurrentRow();
        addToast(res.error || 'Sanaa ei löydy suomen kielen sanakirjasta.');
        sounds.playError();
        return;
      }

      // Valid guess
      const updatedGuesses = [
        ...guesses,
        { guess: res.guess, evaluation: res.evaluation }
      ];
      guesses = updatedGuesses;
      updateKeyStatuses(updatedGuesses);
      currentGuess = '';

      // Play flip sounds
      for (let i = 0; i < length; i++) {
        setTimeout(() => sounds.playTileFlip(i), i * 150);
      }

      if (res.is_game_over) {
        isGameOver = true;
        isWin = res.is_win;
        secret = res.secret || '';
        definitionUrl = res.definition_url || '';

        // The daily session is no longer resumable once the game is over.
        if (mode === 'daily') {
          saveDailySessionId(null);
        }

        setTimeout(() => {
          if (res.is_win) {
            sounds.playWin();
            addToast('🎉 Upea suoritus!', 3000);
          } else {
            sounds.playError();
            addToast(`Peli päättyi! Sana oli: ${secret.toUpperCase()}`, 3500);
          }

          // Stats are daily-only (the server aggregates the same way); free play
          // is unlimited and would inflate streaks.
          if (!user && mode === 'daily') {
            saveLocalStats(res.is_win, updatedGuesses.length);
          } else if (user) {
            fetchServerStats();
          }

          setTimeout(() => {
            isStatsOpen = true;
          }, 1200);
        }, length * 150 + 200);
      }
    } catch (err) {
      addToast(err.message || 'Virhe arvauksen käsittelyssä');
    } finally {
      isSubmitting = false;
    }
  }

  function shareResult() {
    let text = `🌿 Sanasaaga (${mode === 'daily' ? 'Päivän sana' : 'Vapaa'}) ${length}k\n`;
    text += `${isWin ? guesses.length : 'X'}/6\n\n`;

    for (const g of guesses) {
      for (const st of g.evaluation) {
        if (st === 'correct') text += '🟩';
        else if (st === 'present') text += '🟨';
        else text += '⬛';
      }
      text += '\n';
    }

    text += '\nhttps://' + window.location.host;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        addToast('Kopioitu leikepöydälle! 📋');
      }).catch(() => {
        addToast('Kopiointi epäonnistui');
      });
    } else {
      addToast('Leikepöytä ei ole tuettu tällä selaimella');
    }
  }

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isHelpOpen || isStatsOpen || isSettingsOpen || isAuthOpen) return;
    onKeyPress(e.key);
  }

  // Auth actions
  async function handleLogin() {
    try {
      await loginWithGoogle();
      user = pb.authStore.record;
      isAuthOpen = false;
      addToast(`Tervetuloa, ${user.username}! 🦊`);
      fetchServerStats();
      initGame();
    } catch (err) {
      addToast(err.message || 'Kirjautuminen epäonnistui');
    }
  }

  function handleLogout() {
    pbLogout();
    user = null;
    isAuthOpen = false;
    addToast('Kirjauduttu ulos');
    loadLocalStats();
    initGame();
  }

  async function handleUpdateUsername(newName) {
    const updated = await pbUpdateUsername(newName);
    if (updated) {
      user = pb.authStore.record;
      addToast(`Nimimerkki vaihdettu: ${newName}`);
    }
  }

  onMount(() => {
    loadLocalSettings();
    loadLocalStats();
    if (user) {
      fetchServerStats();
    }
    initGame();
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
    }
  });
</script>

<div class="app-container">
  <Header
    {user}
    onOpenHelp={() => { isHelpOpen = true; }}
    onOpenStats={() => { isStatsOpen = true; }}
    onOpenSettings={() => { isSettingsOpen = true; }}
    onOpenAuth={() => { isAuthOpen = true; }}
  />

  {#if mode === 'daily' && dayChanged && !isGameOver}
    <div class="day-changed-banner">
      <span>Pelaat vielä eilistä sanaa.</span>
      <button class="btn-primary day-changed-btn" onclick={giveUpDaily}>Anna periksi – pelaa tänään</button>
    </div>
  {/if}

  <div class="controls-bar">
    {#if mode === 'random'}
      <div class="controls-group">
        <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 700;">PITUUS:</span>
        <div class="pill-select">
          {#each [4, 5, 6, 7, 8] as len}
            <button
              class="pill-btn {length === len ? 'active' : ''}"
              onclick={() => { length = len; initGame(); }}
            >
              {len}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="controls-group">
      <div class="pill-select">
        <button
          class="pill-btn {mode === 'daily' ? 'active' : ''}"
          onclick={() => { mode = 'daily'; initGame(); }}
        >
          Päivän sana
        </button>
        <button
          class="pill-btn {mode === 'random' ? 'active' : ''}"
          onclick={() => { mode = 'random'; initGame(); }}
        >
          Vapaa peli
        </button>
      </div>

      {#if settings.hints && pos}
        <span class="mode-badge" title="Sanaluokka">
          {pos}
        </span>
      {/if}
    </div>
  </div>

  <Board
    {length}
    {guesses}
    {currentGuess}
    currentRow={guesses.length}
    {shakeRow}
  />

  <Keyboard
    {keyStatuses}
    onKey={onKeyPress}
  />
</div>

<Toast messages={toasts} />

<ModalHelp
  isOpen={isHelpOpen}
  onClose={() => { isHelpOpen = false; }}
/>

<ModalStats
  isOpen={isStatsOpen}
  {stats}
  {isGameOver}
  {isWin}
  {secret}
  {definitionUrl}
  {guesses}
  {length}
  {mode}
  onClose={() => { isStatsOpen = false; }}
  onShare={shareResult}
/>

<ModalSettings
  isOpen={isSettingsOpen}
  {settings}
  onUpdateSettings={applySettings}
  onClose={() => { isSettingsOpen = false; }}
/>

<ModalAuth
  isOpen={isAuthOpen}
  {user}
  onLogin={handleLogin}
  onLogout={handleLogout}
  onUpdateUsername={handleUpdateUsername}
  onClose={() => { isAuthOpen = false; }}
/>
