<script>
  import { onMount, onDestroy } from "svelte";
  import { api, connect, setToken, upload, fileUrl } from "./api.js";
  import { prefs } from "./prefs.js";
  import { playSound } from "./sound.js";
  import { toast } from "./toasts.js";
  import Logo from "./Logo.svelte";
  import Avatar from "./Avatar.svelte";
  import Room from "./Room.svelte";
  import Message from "./Message.svelte";
  import Settings from "./Settings.svelte";
  import ServerSettings from "./ServerSettings.svelte";
  import Toasts from "./Toasts.svelte";
  import { createVoiceClient } from "./voice.js";
  import { rnnoiseReady, rnnoiseError } from "./noise.js";

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
  let ping = null;
  let typingName = "";
  let typingTimer = null;
  let socket = null;
  let listEl = null;
  let inputEl = null;
  let lastTypingSent = 0;
  let voice = null;
  let showSettings = false;
  let showServer = false;
  let membersHidden = typeof window !== "undefined" && window.innerWidth <= 860;
  let sideOpen = false;
  let unread = new Set();
  let replyTo = null;
  let pending = [];
  let uploading = false;
  let fileInput = null;
  let hasMore = false;
  let loadingOlder = false;
  let highlightId = null;
  let searchOpen = false;
  let searchQuery = "";
  let searchResults = [];
  let searching = false;
  let pinsOpen = false;
  let pins = [];
  let dragOver = false;
  let emojiOpen = false;

  const QUICK_EMOJI = ["🔥", "😂", "❤️", "👍", "👀", "🎉", "😮", "💀", "🤝", "✅", "🍕", "🚀"];

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
    micError: null,
    rosters: new Map(),
    remote: new Map(),
    local: {},
    levels: new Map(),
  };
  let vs = emptyVoice;
  let unsubscribe = null;
  let unsubscribePrefs = null;

  const desktop = window.nexus?.desktop || null;

  const time = (ts) =>
    new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  $: textList = channels.filter((c) => c.type === "text");
  $: voiceList = channels.filter((c) => c.type === "voice");
  $: inRoom = current?.type === "voice";
  $: voiceChannel = voiceList.find((c) => c.id === vs.channelId) || null;
  $: if (voice && vs.channelId === null && !vs.joining && inRoom) {
    const back = textList[0];
    if (back) openChannel(back);
  }
  let voiceSig = "";
  $: {
    const sig = `${vs.channelId}|${vs.muted}|${vs.deafened}`;
    if (desktop && sig !== voiceSig) {
      voiceSig = sig;
      desktop.setVoiceState({
        inChannel: !!vs.channelId,
        channelName: voiceList.find((c) => c.id === vs.channelId)?.name || "",
        muted: vs.muted,
        deafened: vs.deafened,
      });
    }
  }
  $: if (desktop) desktop.setBadge(unread.size);

  $: onlineMembers = members.filter((m) => online.has(m.id));
  $: offlineMembers = members.filter((m) => !online.has(m.id));

  const roleOf = (userId) => {
    const member = members.find((m) => m.id === userId);
    return member?.roles?.[0] || null;
  };

  async function openChannel(channel) {
    sideOpen = false;
    current = channel;
    replyTo = null;
    pending = [];
    searchOpen = false;
    pinsOpen = false;
    unread.delete(channel.id);
    unread = new Set(unread);
    const data = await api(`/api/channels/${channel.id}/messages`);
    messages = data.messages;
    hasMore = data.messages.length >= 50;
    scrollDown();
  }

  function scrollDown() {
    requestAnimationFrame(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  async function loadOlder() {
    if (!current || loadingOlder || !hasMore || !messages.length) return;
    loadingOlder = true;
    const before = messages[0].id;
    const height = listEl?.scrollHeight || 0;
    try {
      const data = await api(`/api/channels/${current.id}/messages?before=${before}`);
      if (data.messages.length < 50) hasMore = false;
      messages = [...data.messages, ...messages];
      requestAnimationFrame(() => {
        if (listEl) listEl.scrollTop = listEl.scrollHeight - height;
      });
    } finally {
      loadingOlder = false;
    }
  }

  function onScroll() {
    if (listEl && listEl.scrollTop < 60) loadOlder();
  }

  async function send() {
    const value = text.trim();
    if ((!value && !pending.length) || !current) return;
    const body = { text: value, attachments: pending };
    if (replyTo) body.replyTo = replyTo.id;
    text = "";
    pending = [];
    replyTo = null;
    emojiOpen = false;
    const data = await api(`/api/channels/${current.id}/messages`, { method: "POST", body });
    if (!messages.some((m) => m.id === data.message.id)) messages = [...messages, data.message];
    scrollDown();
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Escape") {
      replyTo = null;
      emojiOpen = false;
    }
    if (!current) return;
    const now = Date.now();
    if (now - lastTypingSent > 1200) {
      lastTypingSent = now;
      socket?.send({ t: "typing", channelId: current.id });
    }
  }

  async function addFiles(files) {
    if (!current || !files?.length) return;
    uploading = true;
    try {
      for (const file of [...files].slice(0, 10 - pending.length)) {
        if (file.size > 12 * 1024 * 1024) {
          toast({ name: "Файл", text: `${file.name} больше 12 МБ`, color: "#ff6b8a" });
          continue;
        }
        let size = {};
        if (file.type.startsWith("image/")) {
          size = await new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
              resolve({ width: img.naturalWidth, height: img.naturalHeight });
              URL.revokeObjectURL(url);
            };
            img.onerror = () => resolve({});
            img.src = url;
          });
        }
        try {
          const data = await upload(file, size);
          pending = [...pending, data];
        } catch (error) {
          toast({ name: "Файл", text: error.code === "too_big" ? "Файл больше 12 МБ" : "Не загрузился", color: "#ff6b8a" });
        }
      }
    } finally {
      uploading = false;
    }
  }

  function onPaste(e) {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragOver = false;
    addFiles(e.dataTransfer?.files);
  }

  async function editMessage(message, value) {
    try {
      const data = await api(`/api/messages/${message.id}`, { method: "PATCH", body: { text: value } });
      messages = messages.map((m) => (m.id === data.message.id ? data.message : m));
    } catch {
      toast({ name: "Не вышло", text: "Сообщение не изменилось", color: "#ff6b8a" });
    }
  }

  async function deleteMessage(message) {
    try {
      await api(`/api/messages/${message.id}`, { method: "DELETE" });
    } catch {
      toast({ name: "Не вышло", text: "Сообщение не удалилось", color: "#ff6b8a" });
    }
  }

  async function react(message, emoji) {
    try {
      const data = await api(`/api/messages/${message.id}/reactions`, {
        method: "PUT",
        body: { emoji },
      });
      messages = messages.map((m) => (m.id === message.id ? { ...m, reactions: data.reactions } : m));
    } catch {
      /* реакция не критична */
    }
  }

  async function pin(message) {
    try {
      await api(`/api/messages/${message.id}/pin`, {
        method: "PUT",
        body: { pinned: !message.pinned },
      });
    } catch {
      toast({ name: "Не вышло", text: "Нужно право управлять сообщениями", color: "#ff6b8a" });
    }
  }

  function jumpTo(id) {
    const el = document.getElementById(`m-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightId = id;
    setTimeout(() => (highlightId = null), 1600);
  }

  async function openPins() {
    if (!current) return;
    pinsOpen = !pinsOpen;
    searchOpen = false;
    if (!pinsOpen) return;
    const data = await api(`/api/channels/${current.id}/pins`);
    pins = data.messages;
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!space || q.length < 2) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      const data = await api(`/api/spaces/${space.id}/search?q=${encodeURIComponent(q)}`);
      searchResults = data.messages;
    } finally {
      searching = false;
    }
  }

  async function openResult(message) {
    const channel = channels.find((c) => c.id === message.channelId);
    if (!channel) return;
    searchOpen = false;
    await openChannel(channel);
    setTimeout(() => jumpTo(message.id), 120);
  }

  const canManage = () => permissions.includes("manage_messages");

  function dayLabel(ts) {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(date, today)) return "сегодня";
    if (same(date, yesterday)) return "вчера";
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  function newDay(prev, next) {
    if (!prev) return true;
    return new Date(prev.createdAt).toDateString() !== new Date(next.createdAt).toDateString();
  }

  async function openVoice(channel) {
    if (!channel) return;
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
    if (desktop && document.hidden) {
      desktop.notify({
        name: message.name,
        text: message.text,
        color: message.color,
        avatar: message.avatar,
        channelId: message.channelId,
        channel: channels.find((c) => c.id === message.channelId)?.name || "",
        accent: pref.accent,
      });
    } else {
      toast({
        name: message.name,
        text: message.text,
        color: message.color,
        avatar: message.avatar,
      });
      if (!desktop && pref.notifDesktop && "Notification" in window && Notification.permission === "granted") {
        new Notification(message.name, { body: message.text });
      }
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
    if (event.t === "message.update") {
      messages = messages.map((m) => (m.id === event.message.id ? event.message : m));
      return;
    }
    if (event.t === "message.delete") {
      messages = messages.map((m) =>
        m.id === event.messageId ? { ...m, deleted: true, text: "", attachments: [], reactions: [] } : m
      );
      return;
    }
    if (event.t === "message.reactions") {
      messages = messages.map((m) =>
        m.id === event.messageId ? { ...m, reactions: event.reactions } : m
      );
      return;
    }
    if (event.t === "message.pin") {
      messages = messages.map((m) =>
        m.id === event.messageId ? { ...m, pinned: event.pinned } : m
      );
      if (pinsOpen && current?.id === event.channelId) openPins();
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

  function runAction(action) {
    if (action === "mic") voice?.toggleMic();
    if (action === "deaf") voice?.toggleDeafen();
    if (action === "cam") voice?.toggleCamera().catch(() => {});
    if (action === "screen") voice?.toggleScreen().catch(() => {});
    if (action === "leave") voice?.leave();
    if (action === "search") {
      searchOpen = true;
      pinsOpen = false;
    }
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
    runAction(action);
  }

  function openProfile() {
    sideOpen = false;
    showSettings = true;
  }

  onMount(async () => {
    const boot = await api("/api/bootstrap");
    spaces = boot.spaces || [];
    applyState(boot);
    const first = boot.channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
    socket = connect(handleEvent, (s) => (status = s), (ms) => (ping = ms));
    voice = createVoiceClient({
      send: (payload) => socket.send(payload),
      settings: () => prefs.get(),
    });
    unsubscribe = voice.store.subscribe((value) => (vs = value));
    window.__nexusVoice = voice;
    window.__nexusNoise = { ready: rnnoiseReady, error: rnnoiseError };
    window.addEventListener("keydown", onHotkey);
    if (prefs.get().notifDesktop && !desktop && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (desktop) {
      desktop.setHotkeys(prefs.get().keys);
      desktop.onHotkey((action) => runAction(action));
      desktop.onTrayAction((action) => runAction(action));
      desktop.onNotifyOpen((channelId) => {
        const target = channels.find((c) => c.id === channelId);
        if (target) openChannel(target);
      });
      unsubscribePrefs = prefs.subscribe((p) => desktop.setHotkeys(p.keys));
    }
  });

  onDestroy(() => {
    voice?.leave();
    unsubscribe?.();
    socket?.close();
    clearTimeout(typingTimer);
    unsubscribePrefs?.();
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

<header class="topbar">
  <button class="icon-btn menu-btn" aria-label="Каналы" on:click={() => (sideOpen = !sideOpen)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  </button>

  <a class="brand" href="#" aria-label="Nexus" on:click|preventDefault={() => {}}>
    <Logo />
  </a>

  <div class="top-actions">
    <div class="stat" title="Задержка до сервера">
      <span class="dot-live" class:off={status !== "online"}></span>
      <span>{ping === null ? "—" : `${ping} мс`}</span>
    </div>
    {#if !inRoom}
      <button class="icon-btn" class:on={searchOpen} aria-label="Поиск" title="Поиск (Ctrl+K)" on:click={() => { searchOpen = !searchOpen; pinsOpen = false; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      </button>
      <button class="icon-btn" class:on={pinsOpen} aria-label="Закреплённые" title="Закреплённые" on:click={openPins}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M9 4h6l-1 6 3 3H7l3-3-1-6z" />
          <path d="M12 13v7" />
        </svg>
      </button>
    {/if}
    <button class="icon-btn" class:on={!membersHidden} aria-label="Участники" title="Участники" on:click={() => (membersHidden = !membersHidden)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6" />
        <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
      </svg>
    </button>
    <button class="profile-btn" aria-label="Настройки" on:click={openProfile}>
      <Avatar name={user.name} color={user.color} avatar={user.avatar} size={28} radius={9} />
    </button>
  </div>
</header>

<main class="stage" class:hide-members={membersHidden}>
  <aside class="sidebar" class:open={sideOpen}>
    <div class="chan-rail">
      <div class="chan-group">текст</div>
      {#each textList as channel (channel.id)}
        <button
          class="chan"
          class:active={current?.id === channel.id}
          on:click={() => openChannel(channel)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>
          <span class="nm">{channel.name}</span>
          {#if unread.has(channel.id)}<i class="unread"></i>{/if}
        </button>
      {/each}

      <div class="chan-group">голос</div>
      {#each voiceList as channel (channel.id)}
        <button
          class="chan"
          class:active={current?.id === channel.id}
          class:live={vs.channelId === channel.id}
          on:click={() => openVoice(channel)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          <span class="nm">{channel.name}</span>
          {#if (vs.rosters.get(channel.id) || []).length}
            <i class="live-dot"></i>
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

    {#if vs.channelId && !inRoom}
      <div class="voice-seg" class:muted={vs.muted}>
        <div class="voice-top">
          <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="voice-info">
            <span class="lbl">голос · live</span>
            <span class="nm">{voiceChannel?.name || "канал"}</span>
          </div>
        </div>
        <div class="voice-btns">
          <button class="vbtn" class:off={vs.muted} title="Микрофон" aria-label="Микрофон" on:click={() => voice.toggleMic()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              {#if vs.muted}
                <path d="M9 9v3a3 3 0 0 0 5.1 2.1" /><path d="M15 10.5V6a3 3 0 0 0-5.6-1.5" /><path d="M5 11a7 7 0 0 0 10.6 6" /><path d="M19 11a7 7 0 0 1-.8 3.2" /><path d="M12 18v3" /><path d="m3 3 18 18" />
              {:else}
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
              {/if}
            </svg>
          </button>
          <button class="vbtn" class:off={vs.deafened} title="Звук" aria-label="Звук" on:click={() => voice.toggleDeafen()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="14" width="4" height="6" rx="1.6" /><rect x="17.5" y="14" width="4" height="6" rx="1.6" />
            </svg>
          </button>
          <button class="vbtn" class:off={!vs.cam} title="Камера" aria-label="Камера" on:click={() => voice.toggleCamera().catch(() => {})}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 12 6-3.5v7l-6-3.5" />
            </svg>
          </button>
          <button class="vbtn" class:off={!vs.stream} title="Демонстрация" aria-label="Демонстрация" on:click={() => voice.toggleScreen().catch(() => {})}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M9 21h6" /><path d="M12 17v4" />
            </svg>
          </button>
          <button class="vbtn leave" title="Выйти из канала" aria-label="Выйти из канала" on:click={() => voice.leave()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M15.5 14.5 14 16c-3-1-5-3-6-6l1.5-1.5a1.5 1.5 0 0 0 .2-1.8L8 3.5A1.5 1.5 0 0 0 6.4 2.7H3.3A1.5 1.5 0 0 0 1.8 4.3C2.4 11 7 15.6 13.7 16.2a1.5 1.5 0 0 0 1.6-1.5Z" /><path d="m17 8 5 5" /><path d="m22 8-5 5" />
            </svg>
          </button>
        </div>
      </div>
    {/if}
  </aside>

  <section class="stream-wrap" class:voice-mode={inRoom}>
    {#if inRoom}
      <Room channel={current} {user} people={members} {vs} {voice} />
    {:else if searchOpen}
      <div class="panel">
        <div class="panel-head">
          <input
            class="panel-input"
            bind:value={searchQuery}
            on:input={runSearch}
            placeholder="Поиск по серверу"
            autofocus
          />
          <button class="icon-btn" aria-label="Закрыть" on:click={() => (searchOpen = false)}>✕</button>
        </div>
        <div class="panel-body">
          {#if searching}<div class="panel-hint">ищу…</div>{/if}
          {#if !searching && searchQuery.trim().length >= 2 && !searchResults.length}
            <div class="panel-hint">ничего не нашлось</div>
          {/if}
          {#each searchResults as result (result.id)}
            <button class="result" on:click={() => openResult(result)}>
              <div class="result-head">
                <b style="color:{result.color || 'inherit'}">{result.name}</b>
                <span class="result-chan">#{channels.find((c) => c.id === result.channelId)?.name || ""}</span>
                <time>{new Date(result.createdAt).toLocaleDateString("ru-RU")}</time>
              </div>
              <div class="result-text">{result.text}</div>
            </button>
          {/each}
        </div>
      </div>
    {:else if pinsOpen}
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">закреплённые · {pins.length}</span>
          <button class="icon-btn" aria-label="Закрыть" on:click={() => (pinsOpen = false)}>✕</button>
        </div>
        <div class="panel-body">
          {#if !pins.length}<div class="panel-hint">пока ничего не закреплено</div>{/if}
          {#each pins as pinned (pinned.id)}
            <button class="result" on:click={() => { pinsOpen = false; jumpTo(pinned.id); }}>
              <div class="result-head">
                <b style="color:{pinned.color || 'inherit'}">{pinned.name}</b>
                <time>{new Date(pinned.createdAt).toLocaleDateString("ru-RU")}</time>
              </div>
              <div class="result-text">{pinned.text}</div>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div
        class="stream"
        class:drag={dragOver}
        bind:this={listEl}
        on:scroll={onScroll}
        on:dragover|preventDefault={() => (dragOver = true)}
        on:dragleave={() => (dragOver = false)}
        on:drop={onDrop}
      >
        <div class="stream-inner">
          {#if loadingOlder}<div class="older">загружаю…</div>{/if}
          {#if messages.length === 0}
            <div class="empty">Тут пока тихо. Напиши первым.</div>
          {/if}
          {#each messages as message, i (message.id)}
            {#if newDay(messages[i - 1], message)}
              <div class="divider"><div class="g"></div><div class="l"><span>{dayLabel(message.createdAt)}</span></div></div>
            {/if}
            <div id={`m-${message.id}`} class:flash={highlightId === message.id}>
              <Message
                {message}
                me={user}
                canManage={canManage()}
                role={roleOf(message.userId)}
                onReply={(m) => { replyTo = m; inputEl?.focus(); }}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReact={react}
                onPin={pin}
                onJump={jumpTo}
              />
            </div>
          {/each}
        </div>
      </div>

      <div class="typing" class:show={!!typingName}>
        <span class="typing-dots"><i></i><i></i><i></i></span>
        <span>{typingName ? `${typingName} печатает` : ""}</span>
      </div>

      {#if replyTo}
        <div class="reply-bar">
          <span class="bar"></span>
          <span>ответ <b style="color:{replyTo.color || 'inherit'}">{replyTo.name}</b></span>
          <span class="reply-snip">{replyTo.text}</span>
          <button aria-label="Отменить ответ" on:click={() => (replyTo = null)}>✕</button>
        </div>
      {/if}

      {#if pending.length}
        <div class="pending">
          {#each pending as file (file.url)}
            <div class="pend">
              {#if file.mime.startsWith("image/")}
                <img src={fileUrl(file.url)} alt={file.name} />
              {:else}
                <span class="pend-icon">↓</span>
              {/if}
              <span class="pend-name">{file.name}</span>
              <button aria-label="Убрать" on:click={() => (pending = pending.filter((f) => f.url !== file.url))}>✕</button>
            </div>
          {/each}
        </div>
      {/if}

      <form class="composer" on:submit|preventDefault={send}>
        <input
          class="hidden-file"
          type="file"
          multiple
          bind:this={fileInput}
          on:change={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = ""; }}
        />
        <button type="button" class="comp-btn" title="Прикрепить" aria-label="Прикрепить" on:click={() => fileInput?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div class="emoji-wrap">
          <button type="button" class="comp-btn" title="Эмодзи" aria-label="Эмодзи" on:click={() => (emojiOpen = !emojiOpen)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" />
            </svg>
          </button>
          {#if emojiOpen}
            <div class="emoji-pop">
              {#each QUICK_EMOJI as emoji}
                <button type="button" on:click={() => { text += emoji; emojiOpen = false; inputEl?.focus(); }}>{emoji}</button>
              {/each}
            </div>
          {/if}
        </div>
        <textarea
          bind:this={inputEl}
          bind:value={text}
          on:keydown={onKey}
          on:paste={onPaste}
          rows="1"
          placeholder={current ? `Написать в #${current.name}` : "Выбери канал"}
          disabled={!current}
        ></textarea>
        <button class="send-btn" type="submit" aria-label="Отправить" disabled={uploading}>
          {#if uploading}
            <span>…</span>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M4 12h15" /><path d="m13 6 6 6-6 6" />
            </svg>
          {/if}
        </button>
      </form>
    {/if}
  </section>

  <aside class="members">
    <div class="mem-head">
      участники
      <span class="count">{members.length}</span>
    </div>

    {#if onlineMembers.length}
      <div class="mem-group">
        <h3>в сети — {onlineMembers.length}</h3>
        {#each onlineMembers as member (member.id)}
          <div class="mem">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={32} radius={10} />
            <i class="mem-dot" class:away={statusOf(member.id) === "away"} class:dnd={statusOf(member.id) === "dnd"}></i>
            <div class="mem-info">
              <div class="mem-name" style="color:{member.roles[0]?.color || 'inherit'}">{member.name}</div>
              <div class="mem-act" class:live={member.roles.length > 0}>
                {member.roles.length ? member.roles.map((r) => r.name).join(" · ") : STATUS_LABEL[statusOf(member.id)] || "в сети"}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if offlineMembers.length}
      <div class="mem-group">
        <h3>не в сети — {offlineMembers.length}</h3>
        {#each offlineMembers as member (member.id)}
          <div class="mem off">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={32} radius={10} />
            <div class="mem-info">
              <div class="mem-name">{member.name}</div>
              {#if member.roles.length}
                <div class="mem-act">{member.roles.map((r) => r.name).join(" · ")}</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </aside>
</main>

{#if sideOpen}
  <button class="scrim open" aria-label="Закрыть каналы" on:click={() => (sideOpen = false)}></button>
{/if}

<Toasts />

{#if showSettings}
  <Settings
    {user}
    on:close={() => (showSettings = false)}
    on:user={(e) => applyUser(e.detail)}
    on:logout={logout}
  />
{/if}

{#if showNewServer}
  <div class="modal" role="dialog" aria-modal="true" on:click|self={() => (showNewServer = false)}>
    <div class="new-card">
      <div class="set-head">
        <h2>Сервер</h2>
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
          <label>войти по коду приглашения</label>
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
