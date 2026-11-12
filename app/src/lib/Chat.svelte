<script>
  import { onMount, onDestroy } from "svelte";
  import { api, connect, setToken } from "./api.js";
  import Logo from "./Logo.svelte";
  import Room from "./Room.svelte";
  import { createVoiceClient } from "./voice.js";

  export let user;
  export let onLogout;

  let channels = [];
  let members = [];
  let online = new Set();
  let current = null;
  let messages = [];
  let text = "";
  let status = "offline";
  let typingName = "";
  let typingTimer = null;
  let socket = null;
  let listEl = null;
  let lastTypingSent = 0;
  let voice = null;
  const emptyVoice = {
    channelId: null,
    joining: false,
    joined: false,
    error: null,
    muted: false,
    deafened: false,
    cam: false,
    stream: false,
    micLevel: 0,
    rosters: new Map(),
    remote: new Map(),
    local: {},
    levels: new Map(),
  };
  let vs = emptyVoice;
  let unsubscribe = null;

  const initials = (name) => name.slice(0, 2).toUpperCase();
  const time = (ts) =>
    new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  $: textList = channels.filter((c) => c.type === "text");
  $: voiceList = channels.filter((c) => c.type === "voice");
  $: inRoom = current?.type === "voice";
  $: if (voice && vs.channelId === null && !vs.joining && inRoom) {
    const back = textList[0];
    if (back) openChannel(back);
  }

  async function openChannel(channel) {
    current = channel;
    const data = await api(`/api/channels/${channel.id}/messages`);
    messages = data.messages;
    scrollDown();
  }

  function scrollDown() {
    requestAnimationFrame(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  async function send() {
    const value = text.trim();
    if (!value || !current) return;
    text = "";
    const data = await api(`/api/channels/${current.id}/messages`, {
      method: "POST",
      body: { text: value },
    });
    if (!messages.some((m) => m.id === data.message.id)) messages = [...messages, data.message];
    scrollDown();
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    if (!current) return;
    const now = Date.now();
    if (now - lastTypingSent > 1200) {
      lastTypingSent = now;
      socket?.send({ t: "typing", channelId: current.id });
    }
  }

  async function openVoice(channel) {
    current = channel;
    messages = [];
    if (!voice) return;
    if (vs.channelId === channel.id && vs.joined) return;
    try {
      await voice.join(channel.id);
    } catch {
      /* ошибка показана в комнате */
    }
  }

  function handleEvent(event) {
    if (event.t.startsWith("voice.")) {
      voice?.handle(event);
      return;
    }
    if (event.t === "message") {
      if (current && event.message.channelId === current.id) {
        if (!messages.some((m) => m.id === event.message.id)) {
          messages = [...messages, event.message];
          scrollDown();
        }
      }
      return;
    }
    if (event.t === "presence") {
      online = new Set(event.online);
      return;
    }
    if (event.t === "typing") {
      if (current && event.channelId === current.id && event.userId !== user.id) {
        typingName = event.name;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => (typingName = ""), 2600);
      }
    }
  }

  onMount(async () => {
    const boot = await api("/api/bootstrap");
    channels = boot.channels;
    members = boot.members;
    online = new Set(boot.online);
    const first = boot.channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
    socket = connect(handleEvent, (s) => (status = s));
    voice = createVoiceClient({ send: (payload) => socket.send(payload) });
    unsubscribe = voice.store.subscribe((value) => (vs = value));
    window.__nexusVoice = voice;
  });

  onDestroy(() => {
    voice?.leave();
    unsubscribe?.();
    socket?.close();
    clearTimeout(typingTimer);
  });

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    onLogout();
  }
</script>

<div class="shell">
  <aside class="side">
    <Logo />
    <div class="rail">
      <div class="group">текст</div>
      {#each textList as channel (channel.id)}
        <button
          class="chan"
          class:active={current?.id === channel.id}
          on:click={() => openChannel(channel)}
        >
          <span class="hash">#</span>
          <span>{channel.name}</span>
        </button>
      {/each}

      <div class="group">голос</div>
      {#each voiceList as channel (channel.id)}
        <button
          class="chan"
          class:active={current?.id === channel.id}
          class:live={vs.channelId === channel.id}
          on:click={() => openVoice(channel)}
        >
          <span class="hash">◍</span>
          <span>{channel.name}</span>
          {#if (vs.rosters.get(channel.id) || []).length}
            <i class="chan-count">{(vs.rosters.get(channel.id) || []).length}</i>
          {/if}
        </button>
      {/each}
    </div>

    <div class="me">
      <div class="avatar" style="background:{user.color || '#c8ff3d'}">{initials(user.name)}</div>
      <div class="who">
        <b>{user.name}</b>
        <span class:online={status === "online"}>
          {status === "online" ? "в сети" : "нет связи"}
        </span>
      </div>
      <button class="logout" on:click={logout}>выйти</button>
    </div>
  </aside>

  <section class="main">
    <header class="head">
      <h2>{current ? `${inRoom ? "◍" : "#"}${current.name}` : "Nexus"}</h2>
      <span class="topic">{current?.topic || ""}</span>
      <div class="spacer"></div>
      <div class="pill">
        <span class="dot" class:off={status !== "online"}></span>
        {online.size} в сети
      </div>
    </header>

    {#if inRoom}
      <Room channel={current} {user} people={members} {vs} {voice} />
    {:else}
    <div class="messages" bind:this={listEl}>
      {#if messages.length === 0}
        <div class="empty">Тут пока тихо. Напиши первым.</div>
      {/if}
      {#each messages as message (message.id)}
        <div class="msg">
          <div class="avatar" style="background:{message.color || '#c8ff3d'}">
            {initials(message.name)}
          </div>
          <div>
            <div class="msg-head">
              <b>{message.name}</b>
              <time>{time(message.createdAt)}</time>
            </div>
            <div class="msg-text">{message.text}</div>
          </div>
        </div>
      {/each}
    </div>

    <div class="typing">{typingName ? `${typingName} печатает…` : ""}</div>

    <form class="composer" on:submit|preventDefault={send}>
      <input
        bind:value={text}
        on:keydown={onKey}
        placeholder={current ? `Написать в #${current.name}` : "Выбери канал"}
        disabled={!current}
      />
      <button class="send" type="submit" aria-label="Отправить">↑</button>
    </form>
    {/if}
  </section>
</div>
