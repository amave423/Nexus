<script>
  import { Minus, Square, X } from "@lucide/svelte";

  export let floating = false;

  const desktop = typeof window !== "undefined" ? window.nexus?.desktop || null : null;
</script>

{#if desktop}
  <div class="win-controls" class:floating>
    <button class="win-btn" aria-label="Свернуть" title="Свернуть" on:click={() => desktop.minimize()}>
      <Minus size={14} strokeWidth={1.8} />
    </button>
    <button class="win-btn" aria-label="Развернуть" title="Развернуть" on:click={() => desktop.toggleMaximize()}>
      <Square size={11} strokeWidth={1.8} />
    </button>
    <button class="win-btn close" aria-label="Закрыть" title="Закрыть" on:click={() => desktop.close()}>
      <X size={14} strokeWidth={1.8} />
    </button>
  </div>
{/if}
