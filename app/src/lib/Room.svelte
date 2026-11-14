<script>
  import { onMount, onDestroy } from "svelte";
  import { prefs } from "./prefs.js";
  import { Mic, MicOff, Headphones, HeadphoneOff, Video, MonitorUp, PhoneOff, Expand, SlidersHorizontal, Volume2, VolumeX } from "@lucide/svelte";

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
              {#if mutedOf(p)}<VolumeX size={16} strokeWidth={1.8} />{:else}<Volume2 size={16} strokeWidth={1.8} />{/if}
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
          <Expand size={16} strokeWidth={1.8} />
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
              {#if p.muted}<MicOff size={16} strokeWidth={1.8} />{:else}<Mic size={16} strokeWidth={1.8} />{/if}
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
              {#if p.muted}<i class="seat-mute"><MicOff size={13} strokeWidth={2} /></i>{/if}
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
      {#if vs.muted}<MicOff size={17} strokeWidth={1.8} />{:else}<Mic size={17} strokeWidth={1.8} />{/if}
    </button>
    <button class="rbtn" class:off={vs.deafened} on:click={() => voice.toggleDeafen()} title="Звук">
      {#if vs.deafened}<HeadphoneOff size={17} strokeWidth={1.8} />{:else}<Headphones size={17} strokeWidth={1.8} />{/if}
    </button>
    <button class="rbtn" class:on={vs.cam} on:click={toggleCam} title="Камера">
      <Video size={17} strokeWidth={1.8} />
    </button>
    <button class="rbtn" class:on={vs.stream} on:click={toggleScreen} title="Демонстрация экрана">
      <MonitorUp size={17} strokeWidth={1.8} />
    </button>
    <button class="rbtn" class:on={mixOpen} on:click={() => (mixOpen = !mixOpen)} title="Громкость участников">
      <SlidersHorizontal size={17} strokeWidth={1.8} />
    </button>
    <button class="rbtn leave" on:click={() => voice.leave()}>
      <PhoneOff size={17} strokeWidth={1.8} />
      <span>Выйти</span>
    </button>
  </div>
</div>

