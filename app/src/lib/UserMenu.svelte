<script>
  import { onMount, tick } from "svelte";
  import Avatar from "./Avatar.svelte";
  import { VolumeX, Volume2 } from "@lucide/svelte";

  export let member;
  export let x = 0;
  export let y = 0;
  export let volume = 100;
  export let muted = false;
  export let onVolume = () => {};
  export let onMute = () => {};
  export let onClose = () => {};

  let el = null;
  let pos = { left: x, top: y };

  $: percent = Math.round(volume);

  onMount(async () => {
    await tick();
    place();
  });

  function place() {
    if (!el) return;
    const box = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8));
    pos = { left, top };
  }

  function step(delta) {
    const next = Math.max(0, Math.min(200, percent + delta));
    onVolume(next / 100);
  }
</script>

<svelte:window
  on:pointerdown={(e) => { if (el && !el.contains(e.target)) onClose(); }}
  on:keydown={(e) => e.key === "Escape" && onClose()}
  on:resize={place}
  on:scroll={place}
/>

<div class="umenu" bind:this={el} style="left:{pos.left}px; top:{pos.top}px" role="menu">
  <div class="umenu-head">
    <Avatar name={member.name} color={member.color} avatar={member.avatar} size={30} radius={9} />
    <div class="umenu-who">
      <b>{member.name}</b>
      <span>@{member.login || member.name}</span>
    </div>
  </div>

  <button class="umenu-btn" class:on={muted} on:click={onMute} role="menuitem">
    {#if muted}<Volume2 size={15} strokeWidth={1.8} /><span>Включить звук</span>{:else}<VolumeX size={15} strokeWidth={1.8} /><span>Заглушить у себя</span>{/if}
  </button>

  <div class="umenu-vol">
    <div class="umenu-vol-head">
      <span>громкость</span>
      <b>{percent}%</b>
    </div>
    <input
      class="umenu-range"
      type="range"
      min="0"
      max="200"
      step="1"
      value={percent}
      style="--fill:{percent / 2}%"
      aria-label="Громкость участника"
      on:input={(e) => onVolume(+e.currentTarget.value / 100)}
    />
    <div class="umenu-quick">
      <button on:click={() => step(-10)}>−10</button>
      <button on:click={() => onVolume(1)}>100%</button>
      <button on:click={() => onVolume(2)}>200%</button>
      <button on:click={() => step(10)}>+10</button>
    </div>
  </div>
</div>
