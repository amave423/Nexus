<script>
  import { createEventDispatcher } from "svelte";
  import { ChevronDown, Check } from "@lucide/svelte";

  export let value = "";
  export let options = [];
  export let wide = false;

  const dispatch = createEventDispatcher();
  let open = false;
  let up = false;
  let maxHeight = 230;
  let el = null;

  function pick(option) {
    value = option;
    open = false;
    dispatch("change", option);
  }

  function measure() {
    if (!el) return;
    const box = el.getBoundingClientRect();
    const need = Math.min(230, options.length * 32 + 12);
    const below = window.innerHeight - box.bottom - 14;
    const above = box.top - 14;
    up = below < need && above > below;
    maxHeight = Math.max(92, Math.min(need, up ? above : below));
  }

  function toggle() {
    open = !open;
    if (open) requestAnimationFrame(measure);
  }

  function onWindowClick(event) {
    if (!open) return;
    if (!event.target.closest(".dd")) open = false;
  }
</script>

<svelte:window on:click={onWindowClick} on:resize={measure} on:scroll={measure} />

<div class="dd" class:open class:wide class:up bind:this={el}>
  <button class="dd-btn" type="button" on:click|stopPropagation={toggle}>
    <span>{value || "—"}</span>
    <ChevronDown size={15} strokeWidth={2} />
  </button>
  <div class="dd-list" style="max-height:{maxHeight}px">
    {#each options as option (option)}
      <button
        class="dd-opt"
        class:on={option === value}
        type="button"
        on:click|stopPropagation={() => pick(option)}
      >
        <span>{option}</span>
        {#if option === value}
          <Check size={14} strokeWidth={2.4} />
        {/if}
      </button>
    {/each}
  </div>
</div>
