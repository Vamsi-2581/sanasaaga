<script>
  let {
    isOpen = false,
    user = null,
    onLogin = () => {},
    onLogout = () => {},
    onUpdateUsername = () => {},
    onClose = () => {}
  } = $props();

  let editingUsername = $state(false);
  let newName = $state('');
  let isSaving = $state(false);

  $effect(() => {
    if (user) {
      newName = user.username || '';
    }
  });

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  async function handleSaveName() {
    if (!newName.trim() || newName.trim() === user.username) {
      editingUsername = false;
      return;
    }
    isSaving = true;
    try {
      await onUpdateUsername(newName.trim());
      editingUsername = false;
    } catch (err) {
      alert(err.message || 'Virhe nimimerkin vaihtamisessa');
    } finally {
      isSaving = false;
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={onOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
  >
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="modal-header">
        <h2 id="auth-title" class="modal-title">{user ? 'Pelaajaprofiili' : 'Kirjaudu sisään'}</h2>
        <button class="icon-btn" onclick={onClose} aria-label="Sulje">✕</button>
      </div>

      <div class="modal-body">
        {#if user}
          <div style="text-align: center; padding: 10px 0;">
            <div style="font-size: 3rem; margin-bottom: 6px;">🦊</div>
            
            {#if editingUsername}
              <div style="display: flex; gap: 6px; justify-content: center; margin-top: 8px;">
                <input
                  type="text"
                  bind:value={newName}
                  maxlength="20"
                  style="
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    color: var(--text-color);
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 700;
                  "
                />
                <button class="btn-primary" onclick={handleSaveName} disabled={isSaving}>
                  Tallenna
                </button>
              </div>
            {:else}
              <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-color);">
                {user.username}
              </div>
              <button
                class="btn-secondary"
                onclick={() => { editingUsername = true; }}
                style="margin-top: 8px; font-size: 0.8rem;"
              >
                ✏️ Vaihda nimimerkki
              </button>
            {/if}
          </div>

          <div style="background-color: var(--bg-tertiary); padding: 12px; border-radius: 8px; font-size: 0.84rem; color: var(--text-muted);">
            🔒 <strong>Yksityisyys taattu:</strong> Sähköpostiasi tai oikeaa nimeäsi ei ole tallennettu tietokantaan. Vain anonyymi pelihistoriasi ja tilastosi tallentuvat.
          </div>

          <button class="btn-secondary" onclick={onLogout} style="width: 100%; margin-top: 10px; color: #ef4444;">
            Kirjaudu ulos
          </button>
        {:else}
          <p>
            Kirjautumalla sisään pelihistoriasi, tilastosi ja voittoputkesi synkronoituvat turvallisesti laitteidesi välillä.
          </p>

          <button class="btn-primary" onclick={onLogin} style="width: 100%; padding: 12px; font-size: 1rem;">
            <span>🌐</span>
            <span>Jatka Googlella</span>
          </button>

          <div style="background-color: var(--bg-tertiary); padding: 12px; border-radius: 8px; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
            🔒 <strong>Yksityisyytesi on meille tärkeää:</strong> Emme tallenna sähköpostiosoitettasi emmekä oikeaa nimeäsi. Järjestelmä luo sinulle automaattisesti satunnaisen suomalaisen eläinnimimerkin (kuten <em>Kettu412</em>).
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
