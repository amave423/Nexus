<script>
  import { createEventDispatcher } from "svelte";
  import { ChevronDown, Check } from "@lucide/svelte";

  export let value = "";
  export let options = [];
  export let wide = false;

  const dispatch = createEventDispatcher();
  let open = false;

  function pick(option) {
    value = option;
    open = false;
    dispatch("change", option);
  }

  function onWindowClick(event) {
    if (!open) return;
    if (!event.target.closest(".dd")) open = false;
  }
</script>

<svelte:window on:click={onWindowClick} />

<div class="dd" class:open class:wide>
  <button class="dd-btn" type="button" on:click|stopPropagation={() => (open = !open)}>
    <span>{value || "—"}</span>
    <ChevronDown size={15} strokeWidth={2} />
  </button>
  <div class="dd-list">
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
