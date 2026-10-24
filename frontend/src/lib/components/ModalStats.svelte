<script>
  let {
    isOpen = false,
    stats = { played: 0, wins: 0, win_rate: 0, current_streak: 0, max_streak: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
    isGameOver = false,
    isWin = false,
    secret = '',
    definitionUrl = '',
    guesses = [],
    length = 5,
    mode = 'daily',
    onClose = () => {},
    onShare = () => {}
  } = $props();

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const maxDist = $derived(
    Math.max(1, ...Object.values(stats.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }))
  );
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={onOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
  >
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="stats-title">
      <div class="modal-header">
        <h2 id="stats-title" class="modal-title">Tilastot</h2>
        <button class="icon-btn" onclick={onClose} aria-label="Sulje">✕</button>
      </div>

      <div class="modal-body">
        {#if isGameOver}
          <div style="text-align: center; padding: 6px 0;">
            <h3 style="font-size: 1.3rem; margin-bottom: 4px;">
              {isWin ? '🎉 Onneksi olkoon, voitit!' : 'Peli päättyi!'}
            </h3>
            <p style="color: var(--text-muted);">
              Oikea sana oli: <strong style="color: var(--accent-color); text-transform: uppercase;">{secret}</strong>
            </p>
            {#if definitionUrl}
              <div class="definition-box">
                <a
                  class="definition-link"
                  href={definitionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📖 Avaa sanan määritelmä Kielitoimiston sanakirjassa ↗
                </a>
              </div>
            {/if}
          </div>
        {/if}

        <div style="display: flex; justify-content: space-around; text-align: center; margin: 10px 0;">
          <div>
            <div style="font-size: 1.8rem; font-weight: 800;">{stats.played}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Pelattu</div>
          </div>
          <div>
            <div style="font-size: 1.8rem; font-weight: 800;">{stats.win_rate}%</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Voittoprosentti</div>
          </div>
          <div>
            <div style="font-size: 1.8rem; font-weight: 800;">{stats.current_streak}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Nykyinen putki</div>
          </div>
          <div>
            <div style="font-size: 1.8rem; font-weight: 800;">{stats.max_streak}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Pisin putki</div>
          </div>
        </div>

        <h4 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
          Arvausjakauma
        </h4>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          {#each [1, 2, 3, 4, 5, 6] as att}
            {@const count = stats.distribution ? (stats.distribution[att] || 0) : 0}
            {@const percent = Math.round((count / maxDist) * 100)}
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem;">
              <span style="width: 14px; font-weight: 700;">{att}</span>
              <div
                style="
                  background-color: {count > 0 ? 'var(--accent-color)' : 'var(--bg-tertiary)'};
                  color: {count > 0 ? '#000000' : 'var(--text-muted)'};
                  font-weight: 700;
                  padding: 2px 8px;
                  border-radius: 4px;
                  min-width: 24px;
                  width: {Math.max(8, percent)}%;
                  text-align: right;
                  transition: width 0.3s ease;
                "
              >
                {count}
              </div>
            </div>
          {/each}
        </div>

        {#if isGameOver}
          <div style="margin-top: 14px; display: flex; justify-content: center;">
            <button class="btn-primary" onclick={onShare} style="width: 100%;">
              <span>📋</span>
              <span>Jaa tulos leikepöydälle (🟩🟨⬛)</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
