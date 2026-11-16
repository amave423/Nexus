<script>
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { prefs } from "./prefs.js";
  import Avatar from "./Avatar.svelte";
  import { Mic, MicOff, Headphones, HeadphoneOff, Video, MonitorUp, PhoneOff, Expand, SlidersHorizontal, Volume2, VolumeX } from "@lucide/svelte";

  export let channel;
  export let user;
  export let people = [];
  export let vs;
  export let voice;

  const dispatch = createEventDispatcher();

  let seconds = 0;
  let timer = null;
  let feedEl = null;
  let mixOpen = false;

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
      login: profile.login || "",
      color: m.color || profile.color || "#c8ff3d",
      avatar: m.avatar || profile.avatar || null,
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
  $: quiet = roomies.filter((p) => !camOf(p) && !screenOf(p));
  $: drawer = roomies.find((p) => screenOf(p));
  $: mode = screens.length ? "stream" : cams.length ? "cams" : "talk";
  $: viewers = Math.max(0, roomies.length - 1);
  $: levelOf = (p) => (p.me ? vs.micLevel : vs.levels.get(p.userId) || 0);
  $: speaking = (p) => !p.muted && levelOf(p) > 0.06;
  $: volOf = (p) => Math.round(((vs.volumes?.get(p.userId) ?? 1) * 100));
  $: mutedOf = (p) => !!vs.silent?.has(p.userId);
  $: peak = roomies.reduce((top, p) => (p.muted ? top : Math.max(top, levelOf(p))), 0);

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

  function menu(event, person) {
    if (person.me) return;
    event.preventDefault();
    dispatch("menu", { member: { ...person, id: person.userId }, event });
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
          <Avatar name={p.name} color={p.color} avatar={p.avatar} size={26} radius={8} />
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
              max="200"
              value={volOf(p)}
              style="--fill:{volOf(p) / 2}%"
              aria-label={`Громкость ${p.name}`}
              on:input={(e) => voice.setUserVolume(p.userId, +e.currentTarget.value / 100)}
            />
            <span class="mix-val">{volOf(p)}%</span>
          {:else}
            <span class="mix-name dim">это ты</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="room-stage">
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
            <button class="strip-av" class:speaking={speaking(p)} title={p.name} on:contextmenu={(e) => menu(e, p)}>
              <Avatar name={p.name} color={p.color} avatar={p.avatar} size={30} radius={10} />
            </button>
          {/each}
        </div>
      </div>
    {:else if mode === "cams"}
      <div class="cams">
        {#each cams as p, i (p.userId)}
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
      {#if quiet.length}
        <div class="quiet-strip">
          {#each quiet as p (p.userId)}
            <button
              class="quiet-node"
              class:speaking={speaking(p)}
              style="--lv:{levelOf(p).toFixed(2)}"
              title={p.name}
              on:contextmenu={(e) => menu(e, p)}
            >
              <Avatar name={p.name} color={p.color} avatar={p.avatar} size={40} radius={13} />
              {#if p.muted}<i class="quiet-mute"><MicOff size={11} strokeWidth={2.4} /></i>{/if}
              <span class="quiet-name">{p.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="orbit" data-n={roomies.length}>
        <div class="orbit-hub" style="--lv:{peak.toFixed(2)}">
          <span class="hub-halo"></span>
          <span class="hub-halo h2"></span>
          <span class="hub-core">
            <b>{roomies.length}</b>
            <em>{plural(roomies.length, "голос", "голоса", "голосов")}</em>
          </span>
        </div>
        {#each roomies as p, i (p.userId)}
          <button
            class="node"
            class:speaking={speaking(p)}
            class:me={p.me}
            style="--a:{(360 / Math.max(roomies.length, 1)) * i - 90}deg; --lv:{levelOf(p).toFixed(2)}"
            title={p.name}
            on:contextmenu={(e) => menu(e, p)}
          >
            <span class="node-halo"></span>
            <span class="node-bars"><i></i><i></i><i></i><i></i><i></i></span>
            <Avatar name={p.name} color={p.color} avatar={p.avatar} size={62} radius={22} />
            {#if p.muted}<i class="node-mute"><MicOff size={12} strokeWidth={2.4} /></i>{/if}
            {#if p.deafened}<i class="node-deaf"><HeadphoneOff size={12} strokeWidth={2.4} /></i>{/if}
            <span class="node-name">{p.name}{p.me ? " · ты" : ""}</span>
          </button>
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
