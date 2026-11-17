<script>
  import { Play, Pause, Volume2, VolumeX, Maximize } from "@lucide/svelte";

  export let src = "";
  export let name = "";

  let el = null;
  let wrap = null;
  let playing = false;
  let current = 0;
  let duration = 0;
  let volume = 100;
  let muted = false;
  let seeking = false;
  let idle = false;
  let idleTimer = null;
  let full = false;

  const pad = (n) => String(n).padStart(2, "0");
  function fmt(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  $: progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  function toggle() {
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function onLoaded() {
    duration = Number(el?.duration) || 0;
  }

  function onTime() {
    if (!seeking) current = Number(el?.currentTime) || 0;
  }

  function onSeek(event) {
    const value = Number(event.currentTarget.value);
    current = value;
    if (el) el.currentTime = value;
  }

  function onSeekStart() {
    seeking = true;
  }

  function onSeekEnd() {
    seeking = false;
  }

  function applyVolume(value) {
    volume = Math.max(0, Math.min(100, Math.round(value)));
    if (!el) return;
    el.volume = volume / 100;
    el.muted = muted || volume === 0;
  }

  function onVolume(event) {
    applyVolume(Number(event.currentTarget.value));
  }

  function toggleMute() {
    muted = !muted;
    if (el) el.muted = muted || volume === 0;
  }

  function onFullscreen() {
    full = document.fullscreenElement === wrap;
  }

  function toggleFullscreen() {
    if (!wrap) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrap.requestFullscreen?.().catch(() => {});
  }

  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    if (!playing) return;
    idleTimer = setTimeout(() => (idle = true), 2600);
  }

  function onKey(event) {
    if (!el || event.target?.tagName === "INPUT") return;
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      toggle();
    }
    if (event.key === "m") toggleMute();
  }

  $: if (el) wake();
</script>

<svelte:window on:fullscreenchange={onFullscreen} />

<div
  class="vplayer"
  class:playing
  class:idle
  bind:this={wrap}
  role="group"
  aria-label={name || "Видео"}
  on:pointermove={wake}
  on:pointerleave={() => (idle = false)}
>
  <video
    bind:this={el}
    {src}
    playsinline
    preload="metadata"
    on:click={toggle}
    on:play={() => { playing = true; wake(); }}
    on:pause={() => { playing = false; idle = false; }}
    on:ended={() => { playing = false; idle = false; }}
    on:timeupdate={onTime}
    on:loadedmetadata={onLoaded}
    on:durationchange={onLoaded}
    on:volumechange={() => { muted = !!el?.muted; }}
    on:keydown={onKey}
  ></video>

  {#if !playing}
    <button class="vp-play-big" aria-label="Смотреть" on:click={toggle}>
      <Play size={22} strokeWidth={2} />
    </button>
  {/if}

  <div class="vp-bar">
    <input
      class="vp-seek"
      type="range"
      min="0"
      max={duration || 0}
      step="0.1"
      value={current}
      style="--fill:{progress}%"
      aria-label="Позиция"
      on:input={onSeek}
      on:pointerdown={onSeekStart}
      on:pointerup={onSeekEnd}
      on:change={onSeekEnd}
    />
    <div class="vp-row">
      <button class="vp-btn" aria-label={playing ? "Пауза" : "Смотреть"} title={playing ? "Пауза" : "Смотреть"} on:click={toggle}>
        {#if playing}<Pause size={16} strokeWidth={2} />{:else}<Play size={16} strokeWidth={2} />{/if}
      </button>
      <span class="vp-time">{fmt(current)} <i>/</i> {fmt(duration)}</span>
      <div class="vp-vol">
        <button class="vp-btn" aria-label={muted || volume === 0 ? "Включить звук" : "Выключить звук"} title="Звук" on:click={toggleMute}>
          {#if muted || volume === 0}<VolumeX size={16} strokeWidth={2} />{:else}<Volume2 size={16} strokeWidth={2} />{/if}
        </button>
        <input
          class="vp-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={muted ? 0 : volume}
          style="--fill:{muted ? 0 : volume}%"
          aria-label="Громкость видео"
          on:input={onVolume}
        />
      </div>
      <span class="vp-name" title={name}>{name}</span>
      <button class="vp-btn" aria-label="На весь экран" title="На весь экран" on:click={toggleFullscreen}>
        <Maximize size={16} strokeWidth={2} />
      </button>
    </div>
  </div>
</div>
