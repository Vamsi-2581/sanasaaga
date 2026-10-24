<script>
  let {
    isOpen = false,
    settings = { theme: 'dark', contrast: 'normal', sound: true, hints: false },
    onUpdateSettings = () => {},
    onClose = () => {}
  } = $props();

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function toggleTheme() {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    onUpdateSettings({ ...settings, theme: next });
  }

  function toggleContrast() {
    const next = settings.contrast === 'high' ? 'normal' : 'high';
    onUpdateSettings({ ...settings, contrast: next });
  }

  function toggleSound() {
    onUpdateSettings({ ...settings, sound: !settings.sound });
  }

  function toggleHints() {
    onUpdateSettings({ ...settings, hints: !settings.hints });
  }
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={onOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
  >
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="modal-header">
        <h2 id="settings-title" class="modal-title">Asetukset</h2>
        <button class="icon-btn" onclick={onClose} aria-label="Sulje">✕</button>
      </div>

      <div class="modal-body">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
          <div>
            <div style="font-weight: 700;">Tumma teema</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Vaihda vaalean ja tumman tilan välillä</div>
          </div>
          <button class="btn-secondary" onclick={toggleTheme}>
            {settings.theme === 'dark' ? '🌙 Tumma' : '☀️ Vaalea'}
          </button>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-color);" />

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
          <div>
            <div style="font-weight: 700;">Korkea kontrasti</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Oranssi ja sininen värisokeille</div>
          </div>
          <button class="btn-secondary" onclick={toggleContrast}>
            {settings.contrast === 'high' ? 'Päällä' : 'Pois'}
          </button>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-color);" />

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
          <div>
            <div style="font-weight: 700;">Ääniefektit</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Web Audio API synteettiset äänet</div>
          </div>
          <button class="btn-secondary" onclick={toggleSound}>
            {settings.sound ? '🔊 Päällä' : '🔇 Pois'}
          </button>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-color);" />

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
          <div>
            <div style="font-weight: 700;">Sanaluokkavihje</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Näytä onko sana substantiivi, adjektiivi vai verbi</div>
          </div>
          <button class="btn-secondary" onclick={toggleHints}>
            {settings.hints ? 'Päällä' : 'Pois'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
