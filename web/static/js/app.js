/**
 * Sanadruidi - Client Game Engine
 */

(function () {
  "use strict";

  // Audio Synthesizer using Web Audio API (Zero external assets required)
  class SoundEffects {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    playTone(freq, type = "sine", duration = 0.08, gainVal = 0.1) {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Audio error fallback
      }
    }

    playKey() {
      this.playTone(400, "triangle", 0.04, 0.05);
    }

    playDelete() {
      this.playTone(280, "sine", 0.06, 0.05);
    }

    playTileFlip(index) {
      const baseFreq = 300 + index * 60;
      this.playTone(baseFreq, "sine", 0.1, 0.08);
    }

    playError() {
      this.playTone(180, "sawtooth", 0.18, 0.08);
    }

    playWin() {
      if (!this.enabled) return;
      const notes = [440, 554.37, 659.25, 880]; // A major arpeggio
      notes.forEach((freq, i) => {
        setTimeout(() => {
          this.playTone(freq, "triangle", 0.35, 0.12);
        }, i * 110);
      });
    }
  }

  const sounds = new SoundEffects();

  // Game State
  const state = {
    length: 5,
    category: "all",
    mode: "daily", // 'daily' or 'random'
    sessionId: null,
    pos: null,
    currentRow: 0,
    currentCol: 0,
    currentGuess: "",
    boardData: [], // 6 rows of letter objects
    isGameOver: false,
    isAnimating: false,
    keyStatuses: {}, // letter -> 'correct' | 'present' | 'absent'
    revealedWord: "",
    dailyCompleted: false
  };

  // LocalStorage Keys
  const STORAGE_KEY_SETTINGS = "sanadruidi_settings";
  const STORAGE_KEY_STATS = "sanadruidi_stats";
  const STORAGE_KEY_DAILY_PREFIX = "sanadruidi_daily_";

  // Elements
  const el = {
    board: document.getElementById("board"),
    keyboard: document.getElementById("keyboard"),
    toastContainer: document.getElementById("toastContainer"),
    modeDaily: document.getElementById("modeDaily"),
    modeRandom: document.getElementById("modeRandom"),
    newGameBtn: document.getElementById("newGameBtn"),
    lenButtons: document.querySelectorAll(".len-btn"),
    categorySelect: document.getElementById("categorySelect"),
    hintBadgeContainer: document.getElementById("hintBadgeContainer"),
    hintBadge: document.getElementById("hintBadge"),
    
    // Modals
    helpBtn: document.getElementById("helpBtn"),
    statsBtn: document.getElementById("statsBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    helpDialog: document.getElementById("helpDialog"),
    statsDialog: document.getElementById("statsDialog"),
    settingsDialog: document.getElementById("settingsDialog"),
    gameOverDialog: document.getElementById("gameOverDialog"),
    
    // Settings toggles
    themeToggle: document.getElementById("themeToggle"),
    contrastToggle: document.getElementById("contrastToggle"),
    hintToggle: document.getElementById("hintToggle"),
    soundToggle: document.getElementById("soundToggle"),
    
    // Game over elements
    gameOverTitle: document.getElementById("gameOverTitle"),
    revealedWord: document.getElementById("revealedWord"),
    revealedPos: document.getElementById("revealedPos"),
    dictLink: document.getElementById("dictLink"),
    roundStatsSummary: document.getElementById("roundStatsSummary"),
    gameOverShareBtn: document.getElementById("gameOverShareBtn"),
    gameOverPlayAgainBtn: document.getElementById("gameOverPlayAgainBtn"),
    shareBtn: document.getElementById("shareBtn"),
    
    // Stats elements
    statPlayed: document.getElementById("statPlayed"),
    statWinPct: document.getElementById("statWinPct"),
    statStreak: document.getElementById("statStreak"),
    statMaxStreak: document.getElementById("statMaxStreak"),
    guessDistribution: document.getElementById("guessDistribution"),
    statsDailyCountdown: document.getElementById("statsDailyCountdown"),
    countdownTimer: document.getElementById("countdownTimer")
  };

  // Virtual Keyboard Layout with Å, Ä, Ö
  const KEYBOARD_LAYOUT = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Å"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"]
  ];

  // Toast Helper
  function showToast(message, duration = 2200) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    
    // Trigger transition
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  }

  // Load and apply settings
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");
      if (saved.theme) {
        document.documentElement.setAttribute("data-theme", saved.theme);
        el.themeToggle.checked = (saved.theme === "dark");
      }
      if (saved.contrast) {
        document.documentElement.setAttribute("data-contrast", saved.contrast);
        el.contrastToggle.checked = (saved.contrast === "high");
      }
      if (saved.hint !== undefined) {
        el.hintToggle.checked = saved.hint;
        updateHintVisibility();
      }
      if (saved.sound !== undefined) {
        sounds.enabled = saved.sound;
        el.soundToggle.checked = saved.sound;
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }

  function saveSettings() {
    const currentTheme = el.themeToggle.checked ? "dark" : "light";
    const contrast = el.contrastToggle.checked ? "high" : "normal";
    const hint = el.hintToggle.checked;
    const sound = el.soundToggle.checked;

    document.documentElement.setAttribute("data-theme", currentTheme);
    document.documentElement.setAttribute("data-contrast", contrast);
    sounds.enabled = sound;
    updateHintVisibility();

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({
      theme: currentTheme,
      contrast: contrast,
      hint: hint,
      sound: sound
    }));
  }

  function updateHintVisibility() {
    if (el.hintToggle.checked && state.pos) {
      el.hintBadgeContainer.classList.remove("hidden");
      el.hintBadge.innerHTML = `Sanaluokka: <strong>${escapeHtml(state.pos)}</strong>`;
    } else {
      el.hintBadgeContainer.classList.add("hidden");
    }
  }

  // Load and Save Stats
  function getStats() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_STATS) || JSON.stringify({
        played: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        distribution: [0, 0, 0, 0, 0, 0] // guesses 1 to 6
      }));
    } catch (e) {
      return { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, distribution: [0, 0, 0, 0, 0, 0] };
    }
  }

  function recordGameResult(isWin, attempts) {
    const stats = getStats();
    stats.played += 1;
    if (isWin) {
      stats.wins += 1;
      stats.currentStreak += 1;
      if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
      }
      if (attempts >= 1 && attempts <= 6) {
        stats.distribution[attempts - 1] += 1;
      }
    } else {
      stats.currentStreak = 0;
    }
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));

    if (state.mode === "daily") {
      const todayStr = new Date().toISOString().split("T")[0];
      const dailyKey = `${STORAGE_KEY_DAILY_PREFIX}${todayStr}_${state.length}_${state.category}`;
      localStorage.setItem(dailyKey, JSON.stringify({
        completed: true,
        isWin: isWin,
        attempts: attempts,
        word: state.revealedWord,
        board: state.boardData
      }));
    }
  }

  function renderStats(currentAttemptHighlight = -1) {
    const stats = getStats();
    el.statPlayed.textContent = stats.played;
    const winPct = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
    el.statWinPct.textContent = `${winPct}%`;
    el.statStreak.textContent = stats.currentStreak;
    el.statMaxStreak.textContent = stats.maxStreak;

    // Render distribution bars
    el.guessDistribution.innerHTML = "";
    const maxVal = Math.max(...stats.distribution, 1);

    stats.distribution.forEach((count, i) => {
      const row = document.createElement("div");
      row.className = "dist-row";
      const pct = Math.max(7, Math.round((count / maxVal) * 100));
      const isCurrent = (currentAttemptHighlight === (i + 1));
      row.innerHTML = `
        <span>${i + 1}</span>
        <div class="dist-bar ${isCurrent ? 'current-guess' : ''}" style="width: ${pct}%">${count}</div>
      `;
      el.guessDistribution.appendChild(row);
    });

    if (state.mode === "daily") {
      el.statsDailyCountdown.classList.remove("hidden");
      updateCountdown();
    } else {
      el.statsDailyCountdown.classList.add("hidden");
    }
  }

  function updateCountdown() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = Math.max(0, midnight - now);
    const hours = String(Math.floor(diff / 3600000)).padStart(2, "0");
    const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    el.countdownTimer.textContent = `${hours}:${minutes}:${seconds}`;
  }

  setInterval(() => {
    if (el.statsDialog.open) {
      updateCountdown();
    }
  }, 1000);

  // Initialize Board
  function initBoard() {
    el.board.innerHTML = "";
    state.currentRow = 0;
    state.currentCol = 0;
    state.currentGuess = "";
    state.boardData = [];
    state.keyStatuses = {};
    state.isGameOver = false;
    state.isAnimating = false;

    // Set CSS properties for grid
    el.board.style.setProperty("--word-length", state.length);
    el.board.style.setProperty("--board-aspect", `${state.length} / 6`);

    for (let r = 0; r < 6; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "board-row";
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-label", `Rivi ${r + 1}`);

      const rowTiles = [];
      for (let c = 0; c < state.length; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.setAttribute("role", "gridcell");
        tile.setAttribute("aria-label", `Rivi ${r + 1}, Kirjain ${c + 1}`);
        rowEl.appendChild(tile);
        rowTiles.push({ el: tile, char: "", status: "" });
      }
      el.board.appendChild(rowEl);
      state.boardData.push(rowTiles);
    }

    renderKeyboard();
  }

  // Render Virtual Keyboard
  function renderKeyboard() {
    el.keyboard.innerHTML = "";
    KEYBOARD_LAYOUT.forEach((rowKeys) => {
      const rowEl = document.createElement("div");
      rowEl.className = "keyboard-row";

      rowKeys.forEach((key) => {
        const keyBtn = document.createElement("button");
        keyBtn.className = "key";
        keyBtn.setAttribute("data-key", key);

        if (key === "ENTER") {
          keyBtn.classList.add("wide-key");
          keyBtn.textContent = "SYÖTÄ";
          keyBtn.setAttribute("aria-label", "Syötä sana");
        } else if (key === "BACKSPACE") {
          keyBtn.classList.add("wide-key");
          keyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
              <line x1="18" y1="9" x2="12" y2="15"></line>
              <line x1="12" y1="9" x2="18" y2="15"></line>
            </svg>
          `;
          keyBtn.setAttribute("aria-label", "Poista kirjain");
        } else {
          keyBtn.textContent = key;
        }

        // Apply letter status if already exists
        const letterStatus = state.keyStatuses[key.toLowerCase()];
        if (letterStatus) {
          keyBtn.classList.add(letterStatus);
        }

        keyBtn.addEventListener("click", () => handleInput(key));
        rowEl.appendChild(keyBtn);
      });

      el.keyboard.appendChild(rowEl);
    });
  }

  function updateKeyStatus(letter, newStatus) {
    const l = letter.toLowerCase();
    const current = state.keyStatuses[l];
    // Hierarchy: correct > present > absent
    if (current === "correct") return;
    if (current === "present" && newStatus === "absent") return;

    state.keyStatuses[l] = newStatus;
    const btn = el.keyboard.querySelector(`button[data-key="${letter.toUpperCase()}"]`);
    if (btn) {
      btn.classList.remove("correct", "present", "absent");
      btn.classList.add(newStatus);
    }
  }

  // Handle Input (Key clicks or physical typing)
  function handleInput(key) {
    if (state.isGameOver || state.isAnimating) return;

    const upperKey = key.toUpperCase();

    if (upperKey === "BACKSPACE") {
      sounds.playDelete();
      deleteLetter();
    } else if (upperKey === "ENTER") {
      submitGuess();
    } else if (/^[A-ZÅÄÖ]$/.test(upperKey)) {
      sounds.playKey();
      addLetter(upperKey);
    }
  }

  function addLetter(letter) {
    if (state.currentCol < state.length) {
      const tileObj = state.boardData[state.currentRow][state.currentCol];
      tileObj.char = letter;
      tileObj.el.textContent = letter;
      tileObj.el.setAttribute("data-state", "tbd");
      state.currentGuess += letter.toLowerCase();
      state.currentCol++;
    }
  }

  function deleteLetter() {
    if (state.currentCol > 0) {
      state.currentCol--;
      const tileObj = state.boardData[state.currentRow][state.currentCol];
      tileObj.char = "";
      tileObj.el.textContent = "";
      tileObj.el.removeAttribute("data-state");
      state.currentGuess = state.currentGuess.slice(0, -1);
    }
  }

  async function submitGuess() {
    if (state.currentCol < state.length) {
      shakeCurrentRow();
      sounds.playError();
      showToast("Liian lyhyt sana!");
      return;
    }

    state.isAnimating = true;

    try {
      const res = await fetch("/api/game/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: state.sessionId,
          guess: state.currentGuess
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Virhe arvauksen tarkistuksessa.");
      }

      const data = await res.json();

      if (!data.valid) {
        shakeCurrentRow();
        sounds.playError();
        showToast(data.error || "Sanaa ei löydy sanakirjasta!");
        state.isAnimating = false;
        return;
      }

      // Valid guess - animate tiles flip
      const row = state.currentRow;
      const evaluation = data.evaluation;
      const rowTiles = state.boardData[row];

      for (let i = 0; i < state.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        const tileObj = rowTiles[i];
        tileObj.el.classList.add("flip");
        sounds.playTileFlip(i);

        setTimeout(() => {
          tileObj.el.removeAttribute("data-state");
          tileObj.el.classList.add(evaluation[i]);
          updateKeyStatus(tileObj.char, evaluation[i]);
        }, 250);
      }

      // Wait for flip animations to finish
      await new Promise((resolve) => setTimeout(resolve, 350));

      if (data.is_win) {
        // Victory!
        state.isGameOver = true;
        state.revealedWord = data.secret;
        sounds.playWin();
        const rowEl = el.board.children[row];
        rowEl.classList.add("win");

        const winMessages = ["Loistavaa! 🌟", "Mahtavaa! 🌿", "Täysosuma! 🎯", "Oikein! 👏"];
        const randomMsg = winMessages[Math.floor(Math.random() * winMessages.length)];
        showToast(randomMsg, 3000);

        recordGameResult(true, row + 1);

        setTimeout(() => {
          showGameOverModal(true, data);
        }, 1200);
      } else if (data.is_game_over) {
        // Lost after 6 attempts
        state.isGameOver = true;
        state.revealedWord = data.secret;
        sounds.playError();
        showToast(`Peli päättyi! Oikea sana: ${data.secret.toUpperCase()}`, 3500);

        recordGameResult(false, 6);

        setTimeout(() => {
          showGameOverModal(false, data);
        }, 1400);
      } else {
        // Continue to next row
        state.currentRow++;
        state.currentCol = 0;
        state.currentGuess = "";
      }
    } catch (err) {
      shakeCurrentRow();
      sounds.playError();
      showToast(err.message || "Tapahtui virhe.");
    } finally {
      state.isAnimating = false;
    }
  }

  function shakeCurrentRow() {
    const rowEl = el.board.children[state.currentRow];
    if (rowEl) {
      rowEl.classList.add("shake");
      setTimeout(() => rowEl.classList.remove("shake"), 450);
    }
  }

  function showGameOverModal(isWin, data) {
    el.gameOverTitle.textContent = isWin ? "Voitto! 🎉" : "Kierros päättyi 🌿";
    el.revealedWord.textContent = (data.secret || state.revealedWord).toUpperCase();
    el.revealedPos.textContent = data.pos || state.pos || "Substantiivi";
    el.dictLink.href = data.definition_url || `https://www.kielitoimistonsanakirja.fi/#/${data.secret || state.revealedWord}`;

    const attemptsText = isWin
      ? `Ratkaisit sanan <strong>${state.currentRow + 1}/6</strong> yrityksellä!`
      : "Parempi onni ensi kerralla!";
    el.roundStatsSummary.innerHTML = attemptsText;

    renderStats(isWin ? state.currentRow + 1 : -1);
    el.gameOverDialog.showModal();
  }

  // Start a new game session
  async function startNewGame() {
    try {
      const payload = {
        length: state.length,
        category: state.category,
        mode: state.mode
      };

      const res = await fetch("/api/game/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Uuden pelin aloitus epäonnistui.");

      const data = await res.json();
      state.sessionId = data.session_id;
      state.pos = data.pos;

      initBoard();
      updateHintVisibility();
    } catch (err) {
      console.error(err);
      showToast("Virhe pelin alustuksessa. Yritä uudelleen.");
    }
  }

  // Share Result with Emoji Grid
  function generateShareText() {
    const title = `Sanadruidi (${state.length} kirj.)`;
    const score = state.isGameOver && state.boardData.some(row => row.every(t => t.status === "correct" || t.el.classList.contains("correct")))
      ? `${state.currentRow + 1}/6`
      : "X/6";

    let grid = "";
    for (let r = 0; r <= state.currentRow; r++) {
      let rowEmojis = "";
      let hasTiles = false;
      for (let c = 0; c < state.length; c++) {
        const tile = state.boardData[r][c].el;
        if (tile.classList.contains("correct")) {
          rowEmojis += "🟩";
          hasTiles = true;
        } else if (tile.classList.contains("present")) {
          rowEmojis += "🟨";
          hasTiles = true;
        } else if (tile.classList.contains("absent")) {
          rowEmojis += "⬛";
          hasTiles = true;
        }
      }
      if (hasTiles) {
        grid += rowEmojis + "\n";
      }
    }

    return `${title} ${score}\n\n${grid.trim()}`;
  }

  async function shareResult() {
    const text = generateShareText();
    if (!text.trim()) {
      showToast("Ei jaettavaa tulosta vielä!");
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Sanadruidi",
          text: text
        });
        return;
      } catch (e) {
        // fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast("📋 Tulos kopioitu leikepöydälle!");
    } catch (e) {
      // Fallback prompt
      window.prompt("Kopioi tulos leikepöydälle:", text);
    }
  }

  // Setup Event Listeners
  function setupListeners() {
    // Physical Keyboard Listener
    window.addEventListener("keydown", (e) => {
      // Ignore if a modal is open
      if (document.querySelector("dialog[open]")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      if (key === "Enter") {
        handleInput("ENTER");
      } else if (key === "Backspace") {
        handleInput("BACKSPACE");
      } else if (/^[a-zA-ZåäöÅÄÖ]$/.test(key)) {
        handleInput(key.toUpperCase());
      }
    });

    // Mode Buttons
    el.modeDaily.addEventListener("click", () => {
      if (state.mode === "daily") return;
      state.mode = "daily";
      el.modeDaily.classList.add("active");
      el.modeDaily.setAttribute("aria-selected", "true");
      el.modeRandom.classList.remove("active");
      el.modeRandom.setAttribute("aria-selected", "false");
      startNewGame();
    });

    el.modeRandom.addEventListener("click", () => {
      if (state.mode === "random") return;
      state.mode = "random";
      el.modeRandom.classList.add("active");
      el.modeRandom.setAttribute("aria-selected", "true");
      el.modeDaily.classList.remove("active");
      el.modeDaily.setAttribute("aria-selected", "false");
      startNewGame();
    });

    // New Game Button
    el.newGameBtn.addEventListener("click", () => {
      startNewGame();
      showToast("Uusi sana arvottu!");
    });

    // Word Length Buttons
    el.lenButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const len = parseInt(btn.getAttribute("data-len"), 10);
        if (state.length === len) return;
        el.lenButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.length = len;
        startNewGame();
      });
    });

    // Category Selector
    el.categorySelect.addEventListener("change", (e) => {
      state.category = e.target.value;
      startNewGame();
    });

    // Dialog Openers
    el.helpBtn.addEventListener("click", () => el.helpDialog.showModal());
    el.statsBtn.addEventListener("click", () => {
      renderStats();
      el.statsDialog.showModal();
    });
    el.settingsBtn.addEventListener("click", () => el.settingsDialog.showModal());

    // Share buttons
    el.shareBtn.addEventListener("click", shareResult);
    el.gameOverShareBtn.addEventListener("click", shareResult);

    // Play again from game over modal
    el.gameOverPlayAgainBtn.addEventListener("click", () => {
      el.gameOverDialog.close();
      startNewGame();
    });

    // Settings listeners
    el.themeToggle.addEventListener("change", saveSettings);
    el.contrastToggle.addEventListener("change", saveSettings);
    el.hintToggle.addEventListener("change", saveSettings);
    el.soundToggle.addEventListener("change", saveSettings);

    // MANDATORY Modern Web Guidance: Light-dismiss fallback for dialogs in older browsers
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      document.querySelectorAll("dialog").forEach((dialog) => {
        dialog.addEventListener("click", (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (!isDialogContent) {
            dialog.close();
          }
        });
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Bootstrapping
  function init() {
    loadSettings();
    setupListeners();
    startNewGame();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
