<script>
  import { onMount, onDestroy } from "svelte";
  import { prefs } from "./prefs.js";

  export let channel;
  export let user;
  export let people = [];
  export let vs;
  export let voice;

  let seconds = 0;
  let timer = null;
  let stageEl = null;
  let feedEl = null;
  let mixOpen = false;

  const icons = {
    mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    micOff: '<path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="M15 10.5V6a3 3 0 0 0-5.6-1.5"/><path d="M5 11a7 7 0 0 0 10.6 6"/><path d="M19 11a7 7 0 0 1-.8 3.2"/><path d="M12 18v3"/><path d="m3 3 18 18"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4" height="6" rx="1.6"/><rect x="17.5" y="14" width="4" height="6" rx="1.6"/>',
    headphonesOff: '<path d="M4 14v-2a8 8 0 0 1 12.5-6.6"/><path d="M20 14v-2a8 8 0 0 0-.7-3.3"/><rect x="2.5" y="14" width="4" height="6" rx="1.6"/><rect x="17.5" y="14" width="4" height="6" rx="1.6"/><path d="m3 3 18 18"/>',
    camera: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 12 6-3.5v7l-6-3.5"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M9 21h6"/><path d="M12 17v4"/>',
    phoneOff: '<path d="M15.5 14.5 14 16c-3-1-5-3-6-6l1.5-1.5a1.5 1.5 0 0 0 .2-1.8L8 3.5A1.5 1.5 0 0 0 6.4 2.7H3.3A1.5 1.5 0 0 0 1.8 4.3C2.4 11 7 15.6 13.7 16.2a1.5 1.5 0 0 0 1.6-1.5Z"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
    expand: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/>',
  };

  const initial = (name) => (name || "?").slice(0, 2).toUpperCase();
  const plural = (n, one, few, many) => {
    const m = n % 100;
    if (m > 10 && m < 20) return many;
    const k = n % 10;
    if (k === 1) return one;
    if (k > 1 && k < 5) return few;
    return many;
  };

  $: byId = new Map(people.map((p) => [p.id, p]));
  $: roster = vs.rosters.get(channel.id) || [];
  $: roomies = roster.map((m) => {
    const profile = byId.get(m.userId) || {};
    const itsMe = m.userId === user.id;
    return {
      userId: m.userId,
      name: m.name || profile.name || (itsMe ? user.name : "участник"),
      color: m.color || profile.color || "#c8ff3d",
      muted: m.muted,
      deafened: m.deafened,
      cam: m.cam,
      stream: m.stream,
      me: itsMe,
    };
  });

  const remoteOf = (id) => vs.remote.get(id) || {};
  const screenOf = (p) => (p.me ? vs.local.screen : remoteOf(p.userId).screen);
  const camOf = (p) => (p.me ? vs.local.camera : remoteOf(p.userId).camera);

  $: screens = roomies.filter((p) => screenOf(p));
  $: cams = roomies.filter((p) => camOf(p));
  $: drawer = roomies.find((p) => screenOf(p));
  $: mode = screens.length ? "stream" : cams.length ? "cams" : "talk";
  $: viewers = Math.max(0, roomies.length - 1);
  $: speaking = (p) => vs.levels.has(p.userId);
  $: volOf = (p) => Math.round(((vs.volumes?.get(p.userId) ?? 1) * 100));
  $: mutedOf = (p) => !!vs.silent?.has(p.userId);

  function videoStream(node, stream) {
    const attach = (s) => {
      if (node.srcObject !== (s || null)) node.srcObject = s || null;
      if (s) node.play().catch(() => {});
    };
    attach(stream);
    return { update: attach };
  }

  function fullscreen() {
    const node = feedEl;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.().catch(() => {});
  }

  function toggleCam() {
    voice.toggleCamera().catch(() => {});
  }

  function toggleScreen() {
    voice.toggleScreen().catch(() => {});
  }

  onMount(() => {
    timer = setInterval(() => (seconds += 1), 1000);
  });

  onDestroy(() => clearInterval(timer));

  $: clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
</script>

<div class="room">
  <div class="room-head">
    <div class="room-title">
      <span class="live-dot"></span>
      <h2>{channel.name}</h2>
      <span class="room-timer">{vs.joining ? "подключаюсь" : clock}</span>
    </div>
    <div class="room-meta">
      {roomies.length} {plural(roomies.length, "участник", "участника", "участников")} · opus 48 kHz · {$prefs.quality}
    </div>
  </div>

  {#if vs.micError && !vs.error}
    <div class="mic-warn">
      <span>Микрофон недоступен — тебя не слышно</span>
      <button class="mini" on:click={() => voice.requestMic()}>Включить</button>
    </div>
  {/if}

  {#if mixOpen && roomies.length}
    <div class="mix">
      {#each roomies as p (p.userId)}
        <div class="mix-row">
          <span class="mix-av" style="background:{p.color || '#c8ff3d'}">{initial(p.name)}</span>
          <span class="mix-name">{p.name}{p.me ? " · ты" : ""}</span>
          {#if !p.me}
            <button
              class="mix-btn"
              class:off={mutedOf(p)}
              title={mutedOf(p) ? "Включить звук участника" : "Выключить звук участника"}
              aria-label={mutedOf(p) ? "Включить звук участника" : "Выключить звук участника"}
              on:click={() => voice.setUserMuted(p.userId, !mutedOf(p))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                {#if mutedOf(p)}
                  <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m16 9 5 6" /><path d="m21 9-5 6" />
                {:else}
                  <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
                {/if}
              </svg>
            </button>
            <input
              class="mix-range"
              type="range"
              min="0"
              max="100"
              value={volOf(p)}
              style="--fill:{volOf(p)}%"
              aria-label={`Громкость ${p.name}`}
              on:input={(e) => voice.setUserVolume(p.userId, +e.currentTarget.value / 100)}
            />
          {:else}
            <span class="mix-name dim">это ты</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="room-stage" bind:this={stageEl}>
    {#if vs.error}
      <div class="room-error">
        <b>Не удалось подключиться</b>
        <span>{vs.error}</span>
      </div>
    {:else if mode === "stream"}
      <div class="stream-view">
        <div class="stream-feed" bind:this={feedEl}>
          {#if drawer && screenOf(drawer)}
            <video use:videoStream={screenOf(drawer)} autoplay playsinline muted={drawer.me}></video>
          {/if}
        </div>
        <div class="stream-badge"><span class="live-dot"></span>LIVE</div>
        <div class="stream-who">
          {drawer?.me ? "Ты стримишь" : `${drawer?.name} стримит`} · {viewers}
          {plural(viewers, "смотрит", "смотрят", "смотрят")}
        </div>
        <button class="fs-btn" on:click={fullscreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html icons.expand}</svg>
          <span>На весь экран</span>
        </button>
        <div class="stream-strip">
          {#each roomies as p (p.userId)}
            <span class="strip-av" style="background:{p.color || '#c8ff3d'}" title={p.name}>{initial(p.name)}</span>
          {/each}
        </div>
      </div>
    {:else if mode === "cams"}
      <div class="cams">
        {#each roomies as p, i (p.userId)}
          <div class="cam" class:speaking={speaking(p)} style="--i:{i}">
            {#if camOf(p)}
              <video use:videoStream={camOf(p)} autoplay playsinline muted={p.me}></video>
            {:else}
              <div class="cam-void" style="--c:{p.color || '#c8ff3d'}"></div>
            {/if}
            <span class="cam-name">{p.name}{p.me ? " · ты" : ""}</span>
            <span class="cam-mic" class:off={p.muted}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html p.muted ? icons.micOff : icons.mic}</svg>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="ring" data-n={roomies.length}>
        <div class="orb" class:active={roomies.some(speaking)}>
          <span class="orb-ring"></span>
          <span class="orb-ring r2"></span>
          <span class="orb-core"></span>
        </div>
        {#each roomies as p, i (p.userId)}
          <div class="seat" class:speaking={speaking(p)} style="--a:{(360 / Math.max(roomies.length, 1)) * i - 90}deg">
            <span class="seat-av" style="background:{p.color || '#c8ff3d'}">
              {initial(p.name)}
              {#if p.muted}<i class="seat-mute"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html icons.micOff}</svg></i>{/if}
            </span>
            <span class="seat-name">{p.name}{p.me ? " · ты" : ""}</span>
          </div>
        {/each}
        {#if roomies.length <= 1}
          <p class="room-empty">тут пока никого · позови своих</p>
        {/if}
      </div>
    {/if}
  </div>

  <div class="room-controls">
    <button class="rbtn" class:off={vs.muted} on:click={() => voice.toggleMic()} title="Микрофон">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html vs.muted ? icons.micOff : icons.mic}</svg>
    </button>
    <button class="rbtn" class:off={vs.deafened} on:click={() => voice.toggleDeafen()} title="Звук">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html vs.deafened ? icons.headphonesOff : icons.headphones}</svg>
    </button>
    <button class="rbtn" class:on={vs.cam} on:click={toggleCam} title="Камера">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html icons.camera}</svg>
    </button>
    <button class="rbtn" class:on={vs.stream} on:click={toggleScreen} title="Демонстрация экрана">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html icons.screen}</svg>
    </button>
    <button class="rbtn" class:on={mixOpen} on:click={() => (mixOpen = !mixOpen)} title="Громкость участников">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" />
      </svg>
    </button>
    <button class="rbtn leave" on:click={() => voice.leave()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{@html icons.phoneOff}</svg>
      <span>Выйти</span>
    </button>
  </div>
</div>

