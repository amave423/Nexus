<script>
  export let floating = false;

  const desktop = typeof window !== "undefined" ? window.nexus?.desktop || null : null;
</script>

{#if desktop}
  <div class="win-controls" class:floating>
    <button class="win-btn" aria-label="Свернуть" title="Свернуть" on:click={() => desktop.minimize()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12" /></svg>
    </button>
    <button class="win-btn" aria-label="Развернуть" title="Развернуть" on:click={() => desktop.toggleMaximize()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="6.5" width="11" height="11" rx="1.6" /></svg>
    </button>
    <button class="win-btn close" aria-label="Закрыть" title="Закрыть" on:click={() => desktop.close()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
  </div>
{/if}
