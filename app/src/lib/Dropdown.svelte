<script>
  import { createEventDispatcher } from "svelte";

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        {/if}
      </button>
    {/each}
  </div>
</div>
