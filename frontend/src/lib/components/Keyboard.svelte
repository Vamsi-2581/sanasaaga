<script>
  let {
    keyStatuses = {},
    onKey = () => {}
  } = $props();

  const row1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'å'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'];
  const row3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
</script>

<div class="keyboard-container" aria-label="Virtuaalinen näppäimistö">
  <div class="keyboard-row">
    {#each row1 as k}
      <button
        class="key-btn"
        data-state={keyStatuses[k] || ''}
        onclick={() => onKey(k)}
      >
        {k}
      </button>
    {/each}
  </div>

  <div class="keyboard-row">
    {#each row2 as k}
      <button
        class="key-btn"
        data-state={keyStatuses[k] || ''}
        onclick={() => onKey(k)}
      >
        {k}
      </button>
    {/each}
  </div>

  <div class="keyboard-row">
    <button
      class="key-btn wide"
      onclick={() => onKey('Enter')}
      aria-label="Lähetä arvaus"
    >
      ENTER
    </button>

    {#each row3 as k}
      <button
        class="key-btn"
        data-state={keyStatuses[k] || ''}
        onclick={() => onKey(k)}
      >
        {k}
      </button>
    {/each}

    <button
      class="key-btn wide"
      onclick={() => onKey('Backspace')}
      aria-label="Poista kirjain"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
        <line x1="18" y1="9" x2="12" y2="15"></line>
        <line x1="12" y1="9" x2="18" y2="15"></line>
      </svg>
    </button>
  </div>
</div>
