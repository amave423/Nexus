<script>
  import { onMount, onDestroy } from "svelte";
  import { api, connect, setToken } from "./api.js";
  import { prefs } from "./prefs.js";
  import { playSound } from "./sound.js";
  import { toast } from "./toasts.js";
  import Logo from "./Logo.svelte";
  import Avatar from "./Avatar.svelte";
  import Room from "./Room.svelte";
  import Settings from "./Settings.svelte";
  import ServerSettings from "./ServerSettings.svelte";
  import Toasts from "./Toasts.svelte";
  import { createVoiceClient } from "./voice.js";

  export let user;
  export let onLogout;
  export let onUser = () => {};

  let channels = [];
  let members = [];
  let roles = [];
  let spaces = [];
  let space = null;
  let permissions = [];
  let online = new Set();
  let statuses = {};
  let showNewServer = false;
  let newName = "";
  let joinCode = "";
  let newError = "";
  let busy = false;
  let current = null;
  let messages = [];
  let text = "";
  let status = "offline";
  let typingName = "";
  let typingTimer = null;
  let socket = null;
  let listEl = null;
  let inputEl = null;
  let lastTypingSent = 0;
  let voice = null;
  let showSettings = false;
  let showServer = false;
  let showMembers = false;
  let sideOpen = false;
  let unread = new Set();

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

  const time = (ts) =>
    new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  $: textList = channels.filter((c) => c.type === "text");
  $: voiceList = channels.filter((c) => c.type === "voice");
  $: inRoom = current?.type === "voice";
  $: if (voice && vs.channelId === null && !vs.joining && inRoom) {
    const back = textList[0];
    if (back) openChannel(back);
  }
  $: onlineMembers = members.filter((m) => online.has(m.id));
  $: offlineMembers = members.filter((m) => !online.has(m.id));

  async function openChannel(channel) {
    sideOpen = false;
    current = channel;
    unread.delete(channel.id);
    unread = new Set(unread);
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
    sideOpen = false;
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

  function notifyMessage(message) {
    if (message.userId === user.id) return;
    const pref = prefs.get();
    if (pref.dnd) return;
    const elsewhere = !current || current.id !== message.channelId || document.hidden;
    if (!elsewhere) return;
    if (pref.notifSound) playSound(pref.sound, pref.volume);
    toast({
      name: message.name,
      text: message.text,
      color: message.color,
      avatar: message.avatar,
    });
    if (pref.notifDesktop && "Notification" in window && Notification.permission === "granted") {
      new Notification(message.name, { body: message.text });
    }
    if (current?.id !== message.channelId) {
      unread.add(message.channelId);
      unread = new Set(unread);
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
      notifyMessage(event.message);
      return;
    }
    if (event.t === "presence") {
      online = new Set(event.online);
      statuses = event.statuses || {};
      return;
    }
    if (event.t === "typing") {
      if (current && event.channelId === current.id && event.userId !== user.id) {
        typingName = event.name;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => (typingName = ""), 2600);
      }
      return;
    }
    if (event.t === "member.update") {
      const exists = members.some((m) => m.id === event.member.id);
      members = exists
        ? members.map((m) => (m.id === event.member.id ? event.member : m))
        : [...members, event.member];
      if (event.member.id === user.id) {
        user = { ...user, ...event.member };
        onUser(user);
      }
      return;
    }
    if (event.t === "member.remove") {
      members = members.filter((m) => m.id !== event.userId);
      return;
    }
    if (event.t === "roles.update") {
      roles = event.roles;
      return;
    }
    if (event.t === "space.update") {
      space = event.space;
      spaces = spaces.map((s) => (s.id === event.space.id ? { ...s, ...event.space } : s));
      return;
    }
    if (event.t === "space.deleted") {
      spaces = spaces.filter((s) => s.id !== event.spaceId);
      if (space?.id === event.spaceId) {
        const next = spaces[0];
        if (next) switchSpace(next);
        else logout();
      }
    }
  }

  function applyState(state) {
    space = state.space;
    channels = state.channels;
    members = state.members;
    roles = state.roles || [];
    permissions = state.permissions || [];
    online = new Set(state.online);
    statuses = state.statuses || {};
    current = null;
    messages = [];
  }

  async function switchSpace(target) {
    if (space && target.id === space.id) {
      showServer = true;
      return;
    }
    if (vs.channelId) voice?.leave();
    const state = await api(`/api/spaces/${target.id}/state`);
    applyState(state);
    const first = channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
  }

  async function createSpace() {
    const name = newName.trim();
    if (name.length < 2) {
      newError = "Название от 2 символов";
      return;
    }
    busy = true;
    try {
      const state = await api("/api/spaces", { method: "POST", body: { name } });
      spaces = [...spaces, { ...state.space, channels: state.channels }];
      showNewServer = false;
      newName = "";
      newError = "";
      if (vs.channelId) voice?.leave();
      applyState(state);
      const first = channels.find((c) => c.type === "text");
      if (first) await openChannel(first);
    } catch (error) {
      newError = error.code === "name_length" ? "Название от 2 до 40 символов" : "Не получилось создать";
    } finally {
      busy = false;
    }
  }

  async function joinSpace() {
    const code = joinCode.trim();
    if (!code) return;
    busy = true;
    try {
      const state = await api(`/api/invites/${encodeURIComponent(code)}/join`, { method: "POST" });
      if (!spaces.some((s) => s.id === state.space.id))
        spaces = [...spaces, { ...state.space, channels: state.channels }];
      showNewServer = false;
      joinCode = "";
      newError = "";
      if (vs.channelId) voice?.leave();
      applyState(state);
      const first = channels.find((c) => c.type === "text");
      if (first) await openChannel(first);
    } catch (error) {
      newError = error.code === "invite_invalid" ? "Инвайт не найден или устарел" : "Не получилось войти";
    } finally {
      busy = false;
    }
  }

  const STATUS_LABEL = { online: "в сети", away: "отошёл", dnd: "не беспокоить", offline: "не в сети" };
  const statusOf = (id) => statuses[id] || (online.has(id) ? "online" : "offline");

  function hotkeyAction(combo) {
    const keys = prefs.get().keys;
    for (const [action, value] of Object.entries(keys)) {
      if (value === combo) return action;
    }
    return null;
  }

  function onHotkey(e) {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    const named = { " ": "Space", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
    parts.push(named[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key));
    const action = hotkeyAction(parts.join("+"));
    if (!action) return;
    e.preventDefault();
    if (action === "mic") voice?.toggleMic();
    if (action === "deaf") voice?.toggleDeafen();
    if (action === "cam") voice?.toggleCamera().catch(() => {});
    if (action === "screen") voice?.toggleScreen().catch(() => {});
    if (action === "leave") voice?.leave();
    if (action === "search") inputEl?.focus();
  }

  onMount(async () => {
    const boot = await api("/api/bootstrap");
    spaces = boot.spaces || [];
    applyState(boot);
    const first = boot.channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
    socket = connect(handleEvent, (s) => (status = s));
    voice = createVoiceClient({
      send: (payload) => socket.send(payload),
      settings: () => prefs.get(),
    });
    unsubscribe = voice.store.subscribe((value) => (vs = value));
    window.__nexusVoice = voice;
    window.addEventListener("keydown", onHotkey);
    if (prefs.get().notifDesktop && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  });

  onDestroy(() => {
    voice?.leave();
    unsubscribe?.();
    socket?.close();
    clearTimeout(typingTimer);
    window.removeEventListener("keydown", onHotkey);
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

  function applyUser(updated) {
    user = updated;
    onUser(updated);
  }
</script>

<svelte:window on:keydown={onHotkey} />

<div class="shell">
  <aside class="side" class:open={sideOpen}>
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
          {#if unread.has(channel.id)}<i class="unread"></i>{/if}
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

    <div class="servers">
      {#each spaces as s (s.id)}
        <button
          class="coin"
          class:active={space?.id === s.id}
          title={s.name}
          on:click={() => switchSpace(s)}
        >
          {s.name.slice(0, 1).toUpperCase()}
        </button>
      {/each}
      <button
        class="coin add"
        title="Новый сервер"
        aria-label="Новый сервер"
        on:click={() => { newError = ""; showNewServer = true; }}
      >+</button>
    </div>

    <div class="me">
      <button class="me-btn" on:click={() => (showSettings = true)}>
        <Avatar name={user.name} color={user.color} avatar={user.avatar} size={32} radius={10} />
        <span class="who">
          <b>{user.name}</b>
          <span class:online={status === "online"}>
            {status === "online" ? STATUS_LABEL[user.status] || "в сети" : "нет связи"}
          </span>
        </span>
      </button>
      <button class="logout" on:click={logout}>выйти</button>
    </div>
  </aside>

  <section class="main">
    <header class="head">
      <button class="burger" aria-label="Каналы" on:click={() => (sideOpen = !sideOpen)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <h2>{current ? `${inRoom ? "◍" : "#"}${current.name}` : "Nexus"}</h2>
      <span class="topic">{current?.topic || ""}</span>
      <div class="spacer"></div>
      <div class="pill">
        <span class="dot" class:off={status !== "online"}></span>
        {online.size} в сети
      </div>
      <button class="icon-btn" class:on={showMembers} aria-label="Участники" on:click={() => (showMembers = !showMembers)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5.6" />
          <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
        </svg>
      </button>
      <button class="profile-btn" aria-label="Настройки" on:click={() => { sideOpen = false; showSettings = true; }}>
        <Avatar name={user.name} color={user.color} avatar={user.avatar} size={28} radius={9} />
      </button>
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
          <Avatar name={message.name} color={message.color} avatar={message.avatar} size={38} radius={12} />
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
        bind:this={inputEl}
        bind:value={text}
        on:keydown={onKey}
        placeholder={current ? `Написать в #${current.name}` : "Выбери канал"}
        disabled={!current}
      />
      <button class="send" type="submit" aria-label="Отправить">↑</button>
    </form>
    {/if}
  </section>

  {#if sideOpen}
    <button class="scrim" aria-label="Закрыть каналы" on:click={() => (sideOpen = false)}></button>
  {/if}

  {#if showMembers}
    <aside class="members">
      <div class="members-head">участники · {members.length}</div>
      {#if onlineMembers.length}
        <div class="members-grp">в сети — {onlineMembers.length}</div>
        {#each onlineMembers as member (member.id)}
          <div class="member">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={30} radius={9} />
            <div class="member-who">
              <b style="color:{member.roles[0]?.color || 'inherit'}">{member.name}</b>
              {#if member.roles.length}
                <span>{member.roles.map((r) => r.name).join(" · ")}</span>
              {/if}
            </div>
            <i class="member-dot" class:away={statusOf(member.id) === "away"} class:dnd={statusOf(member.id) === "dnd"}></i>
          </div>
        {/each}
      {/if}
      {#if offlineMembers.length}
        <div class="members-grp">не в сети — {offlineMembers.length}</div>
        {#each offlineMembers as member (member.id)}
          <div class="member off">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={30} radius={9} />
            <div class="member-who">
              <b>{member.name}</b>
              {#if member.roles.length}
                <span>{member.roles.map((r) => r.name).join(" · ")}</span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </aside>
  {/if}
</div>

<Toasts />

{#if showSettings}
  <Settings
    {user}
    on:close={() => (showSettings = false)}
    on:user={(e) => applyUser(e.detail)}
  />
{/if}

{#if showNewServer}
  <div class="modal" role="dialog" aria-modal="true" on:click|self={() => (showNewServer = false)}>
    <div class="new-card">
      <div class="set-head">
        <h2>Новый сервер</h2>
        <button class="icon-btn" aria-label="Закрыть" on:click={() => (showNewServer = false)}>✕</button>
      </div>
      <div class="new-body">
        <div class="set-field">
          <label>создать свой</label>
          <input
            class="set-input"
            bind:value={newName}
            placeholder="Название сервера"
            maxlength="40"
            on:keydown={(e) => e.key === "Enter" && createSpace()}
          />
          <button class="set-copy" disabled={busy} on:click={createSpace}>Создать сервер</button>
        </div>
        <div class="new-sep"><span>или</span></div>
        <div class="set-field">
          <label>войти по коду</label>
          <input
            class="set-input"
            bind:value={joinCode}
            placeholder="Код приглашения"
            on:keydown={(e) => e.key === "Enter" && joinSpace()}
          />
          <button class="ghost-btn" disabled={busy} on:click={joinSpace}>Присоединиться</button>
        </div>
        {#if newError}<div class="new-err">{newError}</div>{/if}
      </div>
    </div>
  </div>
{/if}

{#if showServer && space}
  <ServerSettings
    {space}
    {roles}
    {members}
    {permissions}
    {user}
    on:close={() => (showServer = false)}
    on:space={(e) => (space = e.detail)}
    on:roles={(e) => (roles = e.detail)}
    on:members={(e) => (members = e.detail)}
    on:deleted={logout}
  />
{/if}
