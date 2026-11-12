<script>
  import { onMount, onDestroy } from "svelte";

  export let channel;
  export let user;
  export let people = [];
  export let vs;
  export let voice;

  let seconds = 0;
  let timer = null;
  let stageEl = null;
  let feedEl = null;

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
      {roomies.length} {plural(roomies.length, "участник", "участника", "участников")} · opus 48 kHz
    </div>
  </div>

  <div class="room-stage" bind:this={stageEl}>
    {#if vs.error}
      <div class="room-error">
        <b>Не удалось подключиться</b>
        <span>{vs.error === "no_mic" ? "нет доступа к микрофону" : vs.error}</span>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html icons.expand}</svg>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html p.muted ? icons.micOff : icons.mic}</svg>
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
              {#if p.muted}<i class="seat-mute"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">{@html icons.micOff}</svg></i>{/if}
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html vs.muted ? icons.micOff : icons.mic}</svg>
      {#if !vs.muted}<i class="lvl" style="--l:{vs.micLevel}"></i>{/if}
    </button>
    <button class="rbtn" class:off={vs.deafened} on:click={() => voice.toggleDeafen()} title="Звук">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html vs.deafened ? icons.headphonesOff : icons.headphones}</svg>
    </button>
    <button class="rbtn" class:on={vs.cam} on:click={toggleCam} title="Камера">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html icons.camera}</svg>
    </button>
    <button class="rbtn" class:on={vs.stream} on:click={toggleScreen} title="Демонстрация экрана">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html icons.screen}</svg>
    </button>
    <button class="rbtn leave" on:click={() => voice.leave()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">{@html icons.phoneOff}</svg>
      <span>Выйти</span>
    </button>
  </div>
</div>

