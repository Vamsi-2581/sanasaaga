<script>
  let { isOpen = false, onClose = () => {} } = $props();

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
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
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="modal-header">
        <h2 id="help-title" class="modal-title">Kuinka pelataan</h2>
        <button class="icon-btn" onclick={onClose} aria-label="Sulje">✕</button>
      </div>

      <div class="modal-body">
        <p>Arvaa kätketty suomenkielinen sana <strong>6 yrityksellä</strong>.</p>
        <p>Jokaisen arvauksen tulee olla hyväksytty suomen kielen sana valitulla pituudella. Paina ENTER tarkistaaksesi sanan.</p>
        
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 4px 0;" />
        
        <p><strong>Värit kertovat kuinka lähellä olit:</strong></p>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div class="tile" data-state="correct" style="width: 42px; height: 42px; font-size: 1.2rem;">K</div>
          <span>Kirjain <strong>K</strong> on sanassa ja oikealla paikalla.</span>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div class="tile" data-state="present" style="width: 42px; height: 42px; font-size: 1.2rem;">O</div>
          <span>Kirjain <strong>O</strong> on sanassa, mutta väärällä paikalla.</span>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <div class="tile" data-state="absent" style="width: 42px; height: 42px; font-size: 1.2rem;">I</div>
          <span>Kirjain <strong>I</strong> ei esiinny kätketyssä sanassa lainkaan.</span>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 4px 0;" />

        <p>Sanat ovat suomen kielen perusmuotoisia substantiiveja, adjektiiveja tai verbejä Kotimaisten kielten keskuksen (Kotus) sanaston mukaisesti.</p>
        <p>Kierroksen päätyttyä voit avata sanan virallisen määritelmän Kielitoimiston sanakirjasta!</p>
      </div>
    </div>
  </div>
{/if}
