<script>
  let {
    length = 5,
    guesses = [],
    currentGuess = '',
    currentRow = 0,
    shakeRow = -1
  } = $props();

  const maxAttempts = 6;
  const rows = Array.from({ length: maxAttempts }, (_, i) => i);
  const cols = $derived(Array.from({ length }, (_, i) => i));
</script>

<div class="board-container">
  <div
    class="board-grid"
    style="aspect-ratio: {length} / 6;"
  >
    {#each rows as r}
      <div
        class="board-row {shakeRow === r ? 'shake' : ''}"
        style="grid-template-columns: repeat({length}, 1fr);"
      >
        {#each cols as c}
          {@const isPastRow = r < guesses.length}
          {@const isCurrentRow = r === currentRow}
          {@const pastGuess = isPastRow ? guesses[r] : null}
          {@const letter = isPastRow
            ? pastGuess.guess[c]
            : isCurrentRow
              ? (currentGuess[c] || '')
              : ''}
          {@const state = isPastRow
            ? pastGuess.evaluation[c]
            : (isCurrentRow && letter ? 'active' : 'empty')}

          <div
            class="tile"
            data-state={state}
          >
            {letter}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
