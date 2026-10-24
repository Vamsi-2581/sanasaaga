<script>
  let { messages = [] } = $props();
</script>

{#if messages.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each messages as msg (msg.id)}
      <div class="toast">
        {msg.text}
      </div>
    {/each}
  </div>
{/if}
