<script>
  import { toasts, dismiss } from "./toasts.js";
  import Avatar from "./Avatar.svelte";
</script>

<div class="toasts">
  {#each $toasts as t (t.id)}
    <button class="toast" type="button" on:click={() => dismiss(t.id)}>
      <Avatar name={t.name} color={t.color} avatar={t.avatar} size={34} radius={11} />
      <div class="toast-body">
        <div class="toast-top">
          <b>{t.name}</b>
          <span>сейчас</span>
        </div>
        <div class="toast-text">{t.text}</div>
      </div>
    </button>
  {/each}
</div>
