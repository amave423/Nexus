<script>
  import { onMount, onDestroy } from "svelte";
  import { api, connect, setToken, upload, fileUrl } from "./api.js";
  import { prefs } from "./prefs.js";
  import { cue, playSound } from "./sound.js";
  import { toast } from "./toasts.js";
  import Logo from "./Logo.svelte";
  import Avatar from "./Avatar.svelte";
  import Room from "./Room.svelte";
  import Message from "./Message.svelte";
  import Settings from "./Settings.svelte";
  import ServerSettings from "./ServerSettings.svelte";
  import Lightbox from "./Lightbox.svelte";
  import Toasts from "./Toasts.svelte";
  import WinControls from "./WinControls.svelte";
  import { createVoiceClient } from "./voice.js";
  import { rnnoiseReady, rnnoiseError } from "./noise.js";
  import { Hash, Volume2, Settings as SettingsIcon, Search, Pin, Users, FaceSlightlySmiling, Paperclip, Send, PhoneOff, Mic, MicOff, Headphones, HeadphoneOff, Video, MonitorUp, Plus, Pencil, Trash, X, Menu } from "@lucide/svelte";

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
  let lastSeen = {};
  let showNewServer = false;
  let newName = "";
  let newQuotaGiB = "1";
  let diskInfo = null;
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
  let viewer = null;
  let membersHidden = typeof window !== "undefined" && window.innerWidth <= 860;
  let membersTouched = false;
  const syncMembers = () => {
    if (!membersTouched) membersHidden = window.innerWidth <= 860;
  };
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
  let lastVoiceChannel = null;
  let lastRoster = null;

  let customEmoji = [];
  let emojiSearch = "";
  const QUICK_EMOJI = ["🔥", "😂", "❤️", "👍", "👀", "🎉", "😮", "💀", "🤝", "✅", "🍕", "🚀", "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😎", "🤔", "🙄", "😴", "😭", "😡", "🤯", "🥳", "😱", "🙏", "👏", "💪", "💯", "✨", "🌟", "💖", "💔", "💰", "🎁", "🎂", "🎮", "🎧", "⚽", "🏆", "🌈", "☀️", "🌙", "🍎", "🍕", "🍔", "🍟", "🍰", "☕", "🐱", "🐶", "🦊", "🐸", "🐼", "🦄", "🚀", "✈️", "🚗", "❤️‍🔥", "🤖", "💀", "👻", "🎃", "🤝", "✅", "❌", "⚡", "🔥"];

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
        channelName: vs.channelName || voiceList.find((c) => c.id === vs.channelId)?.name || "",
        muted: vs.muted,
        deafened: vs.deafened,
      });
    }
  }
  $: if (desktop) desktop.setBadge(unread.size);

  $: onlineMembers = members.filter((m) => online.has(m.id));
  $: offlineMembers = members.filter((m) => !online.has(m.id));
  $: pingTone =
    status !== "online" || ping === null
      ? "none"
      : ping <= 60
        ? "low"
        : ping <= 120
          ? "mid"
          : ping <= 220
            ? "high"
            : "bad";
  $: roleGroups = roles
    .map((role) => ({ role, list: onlineMembers.filter((m) => m.roles[0]?.id === role.id) }))
    .filter((group) => group.list.length);
  $: looseOnline = onlineMembers.filter((m) => !m.roles.length);

  function cueSound(kind, pref = prefs.get()) {
    if (!pref.voiceSounds) return;
    cue(kind, pref.volume);
  }

  function watchVoice(next) {
    if (!next.channelId) {
      lastVoiceChannel = null;
      lastRoster = null;
      return;
    }
    if (next.channelId !== lastVoiceChannel) {
      lastVoiceChannel = next.channelId;
      lastRoster = null;
    }
    if (!next.joined) {
      lastRoster = null;
      return;
    }
    const roster = next.rosters.get(next.channelId) || [];
    const map = new Map(roster.map((m) => [m.userId, m]));
    const pref = prefs.get();
    if (!lastRoster) {
      lastRoster = map;
      cueSound("join", pref);
      return;
    }
    for (const [id, member] of map) {
      const was = lastRoster.get(id);
      if (!was) {
        cueSound("join", pref);
        continue;
      }
      if (!!was.cam !== !!member.cam) cueSound("cam", pref);
      if (!!was.stream !== !!member.stream) cueSound("screen", pref);
    }
    for (const id of lastRoster.keys()) if (!map.has(id)) cueSound("leave", pref);
    lastRoster = map;
  }

  function toggleMic() {
    voice?.toggleMic();
  }

  function toggleDeafen() {
    voice?.toggleDeafen();
  }

  function toggleCam() {
    voice?.toggleCamera().catch(() => {});
  }

  function toggleScreen() {
    voice?.toggleScreen().catch(() => {});
  }

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

  function growInput() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(120, Math.max(38, inputEl.scrollHeight))}px`;
  }

  function scrollDown() {
    const go = () => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    };
    const settle = () => {
      go();
      if (!listEl) return;
      for (const img of listEl.querySelectorAll("img")) {
        if (!img.complete) img.addEventListener("load", go, { once: true });
      }
    };
    requestAnimationFrame(settle);
    setTimeout(go, 120);
    setTimeout(go, 380);
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
    requestAnimationFrame(growInput);
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
          const data = await upload(file, size, space.id);
          pending = [...pending, data];
        } catch (error) {
          const why =
            error.code === "too_big"
              ? "Файл больше 12 МБ"
              : error.code === "quota_full" || error.code === "disk_limit"
                ? "На сервере нет места"
                : "Не загрузился";
          toast({ name: file.name, text: why, color: "#ff6b8a" });
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
      messages = messages.filter((m) => m.id !== message.id);
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
      await voice.join(channel.id, channel.name);
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
      messages = messages.filter((m) => m.id !== event.messageId);
      pins = pins.filter((m) => m.id !== event.messageId);
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
    if (event.t === "channel.create") {
      channels = [...channels, event.channel];
      return;
    }
    if (event.t === "channel.update") {
      channels = channels.map((c) => c.id === event.channel.id ? event.channel : c);
      if (current?.id === event.channel.id) current = event.channel;
      return;
    }
    if (event.t === "channel.delete") {
      channels = channels.filter((c) => c.id !== event.channelId);
      if (current?.id === event.channelId) {
        const next = channels.find((c) => c.type === "text");
        if (next) openChannel(next);
        else { current = null; messages = []; }
      }
      return;
    }
    if (event.t === "emoji.update") {
      customEmoji = [...customEmoji.filter((e) => e.id !== event.emoji.id), event.emoji];
      return;
    }
    if (event.t === "emoji.delete") {
      customEmoji = customEmoji.filter((e) => e.id !== event.emojiId);
      return;
    }
    if (event.t === "presence") {
      online = new Set(event.online);
      statuses = event.statuses || {};
      lastSeen = { ...lastSeen, ...(event.lastSeen || {}) };
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
      dropSpace(event.spaceId);
    }
  }

  function dropSpace(spaceId) {
    spaces = spaces.filter((s) => s.id !== spaceId);
    if (space?.id !== spaceId) return;
    showServer = false;
    const inGoneChannel =
      vs.channelId && !spaces.some((s) => (s.channels || []).some((c) => c.id === vs.channelId));
    if (inGoneChannel) voice?.leave();
    const next = spaces[0];
    if (next) switchSpace(next).catch(() => blankState());
    else blankState();
  }

  function blankState() {
    space = null;
    channels = [];
    members = [];
    roles = [];
    permissions = [];
    online = new Set();
    statuses = {};
    lastSeen = {};
    current = null;
    messages = [];
  }

  function applyState(state) {
    space = state.space;
    channels = state.channels;
    members = state.members;
    roles = state.roles || [];
    permissions = state.permissions || [];
    online = new Set(state.online);
    statuses = state.statuses || {};
    lastSeen = state.lastSeen || {};
    current = null;
    messages = [];
  }

  async function switchSpace(target) {
    if (space && target.id === space.id) {
      showServer = true;
      return;
    }
    const [state, emojiData] = await Promise.all([
      api(`/api/spaces/${target.id}/state`), api(`/api/spaces/${target.id}/emoji`)
    ]);
    applyState(state);
    customEmoji = emojiData.emoji;
    const first = channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
  }

  async function openNewServer() {
    newError = "";
    showNewServer = true;
    try { diskInfo = await api("/api/disk"); } catch { diskInfo = null; }
  }

  async function createSpace() {
    const name = newName.trim();
    if (name.length < 2) {
      newError = "Название от 2 символов";
      return;
    }
    busy = true;
    try {
      const quotaBytes = Math.round(Number(newQuotaGiB) * 1024 ** 3);
      const state = await api("/api/spaces", { method: "POST", body: { name, quotaBytes } });
      spaces = [...spaces, { ...state.space, channels: state.channels }];
      showNewServer = false;
      newName = "";
      newError = "";
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
      applyState(state);
      const first = channels.find((c) => c.type === "text");
      if (first) await openChannel(first);
    } catch (error) {
      newError = error.code === "invite_invalid" ? "Инвайт не найден или устарел" : "Не получилось войти";
    } finally {
      busy = false;
    }
  }

  const STATUS_LABEL = { online: "в сети", idle: "отошёл", dnd: "не беспокоить", invisible: "невидимка", offline: "не в сети" };
  const statusOf = (id) => statuses[id] || (online.has(id) ? "online" : "offline");
  const DOT_COLOR = { online: "#c8ff3d", idle: "#ffb454", dnd: "#ff6b8a", invisible: "#6e6e7c", offline: "#3a3a44" };
  const OFFLINE_DOT = "#3a3a44";
  const dotOf = (id) => DOT_COLOR[statusOf(id)] || OFFLINE_DOT;

  function lastSeenText(id) {
    const ts = lastSeen[id] || members.find((m) => m.id === id)?.lastSeen;
    if (!ts) return "не в сети";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "был(а) только что";
    if (diff < 3_600_000) return `был(а) ${Math.floor(diff / 60_000)} мин назад`;
    const date = new Date(ts);
    const now = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (date.toDateString() === now.toDateString())
      return `был(а) в ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    if (date.toDateString() === yesterday.toDateString()) return "был(а) вчера";
    return `был(а) ${date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
  }

  function hotkeyAction(combo) {
    const keys = prefs.get().keys;
    for (const [action, value] of Object.entries(keys)) {
      if (value === combo) return action;
    }
    return null;
  }

  function runAction(action) {
    if (action === "mic") toggleMic();
    if (action === "deaf") toggleDeafen();
    if (action === "cam") toggleCam();
    if (action === "screen") toggleScreen();
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
    syncMembers();
    window.addEventListener("resize", syncMembers);
    const boot = await api("/api/bootstrap");
    spaces = boot.spaces || [];
    applyState(boot);
    customEmoji = (await api(`/api/spaces/${boot.space.id}/emoji`).catch(() => ({emoji:[]}))).emoji;
    const first = boot.channels.find((c) => c.type === "text");
    if (first) await openChannel(first);
    socket = connect(handleEvent, (s) => (status = s), (ms) => (ping = ms));
    voice = createVoiceClient({
      send: (payload) => socket.send(payload),
      settings: () => prefs.get(),
    });
    unsubscribe = voice.store.subscribe((value) => {
      vs = value;
      watchVoice(value);
    });
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
      unsubscribePrefs = prefs.subscribe((p) => {
        desktop.setHotkeys(p.keys);
        voice?.applySettings(p);
      });
    }
  });

  onDestroy(() => {
    voice?.leave();
    unsubscribe?.();
    socket?.close();
    clearTimeout(typingTimer);
    unsubscribePrefs?.();
    window.removeEventListener("keydown", onHotkey);
    window.removeEventListener("resize", syncMembers);
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
    <Menu size={17} strokeWidth={1.8} />
  </button>

  <span class="netstat {pingTone}" title={status === "online" ? "Задержка до сервера" : "Нет связи с сервером"}>
    <i class="net-dot"></i>
    <span class="net-val"><b>{ping === null ? "—" : ping}</b> <span class="net-unit">мс</span></span>
  </span>

  <a class="brand" href="#" aria-label="Nexus" on:click|preventDefault={() => {}}>
    <Logo />
  </a>

  <div class="top-actions">
    {#if !inRoom}
      <button class="icon-btn" class:on={searchOpen} aria-label="Поиск" title="Поиск (Ctrl+K)" on:click={() => { searchOpen = !searchOpen; pinsOpen = false; }}>
        <Search size={17} strokeWidth={1.8} />
      </button>
      <button class="icon-btn" class:on={pinsOpen} aria-label="Закреплённые" title="Закреплённые" on:click={openPins}>
        <Pin size={17} strokeWidth={1.8} />
      </button>
    {/if}
    <button class="icon-btn" class:on={!membersHidden} aria-label="Участники" title="Участники" on:click={() => { membersTouched = true; membersHidden = !membersHidden; }}>
      <Users size={17} strokeWidth={1.8} />
    </button>
    <button class="profile-btn" aria-label="Настройки" on:click={openProfile}>
      <Avatar name={user.name} color={user.color} avatar={user.avatar} size={28} radius={9} />
    </button>
  </div>

  <WinControls />
</header>

<main class="stage" class:hide-members={membersHidden}>
  <aside class="sidebar" class:open={sideOpen}>
    <div class="chan-rail">
      <div class="chan-rail-head"><span>каналы</span><button class="server-settings-trigger" aria-label="Параметры сервера" title="Настройки сервера" on:click={() => (showServer = true)}><SettingsIcon size={16} /></button></div>
      <div class="chan-group">текст</div>
      {#each textList as channel (channel.id)}
        <button class="chan" class:active={current?.id === channel.id} on:click={() => openChannel(channel)}>
          <Hash size={16} strokeWidth={1.8} />
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
          <Volume2 size={16} strokeWidth={1.8} />
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
        on:click={openNewServer}
      >+</button>
    </div>

    {#if vs.channelId}
    <div class="voice-seg" class:muted={vs.muted}>
        <div class="voice-top">
          <div class="wave" class:still={!vs.channelId}><i></i><i></i><i></i><i></i><i></i></div>
          <div class="voice-info">
            <span class="lbl">{vs.channelId ? "в голосовом" : "не в голосе"}</span>
            <span class="nm">{vs.channelId ? vs.channelName || voiceChannel?.name || "канал" : user.name}</span>
          </div>
        </div>
        <div class="voice-btns">
          <button class="vbtn" class:off={vs.muted} title="Микрофон" aria-label="Микрофон" on:click={toggleMic}>
            {#if vs.muted}<MicOff size={17} strokeWidth={1.8} />{:else}<Mic size={17} strokeWidth={1.8} />{/if}
          </button>
          <button class="vbtn" class:off={vs.deafened} title="Звук" aria-label="Звук" on:click={toggleDeafen}>
            {#if vs.deafened}<HeadphoneOff size={17} strokeWidth={1.8} />{:else}<Headphones size={17} strokeWidth={1.8} />{/if}
          </button>
          {#if vs.channelId}
            <button class="vbtn" class:on={vs.cam} title="Камера" aria-label="Камера" on:click={toggleCam}>
              <Video size={17} strokeWidth={1.8} />
            </button>
            <button class="vbtn" class:on={vs.stream} title="Демонстрация" aria-label="Демонстрация" on:click={toggleScreen}>
              <MonitorUp size={17} strokeWidth={1.8} />
            </button>
            <button class="vbtn leave" title="Выйти из канала" aria-label="Выйти из канала" on:click={() => voice.leave()}>
              <PhoneOff size={17} strokeWidth={1.8} />
            </button>
          {:else}
            <button class="vbtn" title="Параметры" aria-label="Параметры" on:click={openProfile}>
              <SettingsIcon size={17} strokeWidth={1.8} />
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </aside>

  <section class="stream-wrap" class:voice-mode={inRoom}>
    {#if !space}
      <div class="no-space">
        <h2>Сервера пока нет</h2>
        <p>Создай свой или зайди по коду приглашения.</p>
        <button class="set-copy" on:click={openNewServer}>Создать или войти</button>
      </div>
    {:else if inRoom}
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
                {customEmoji}
                me={user}
                canManage={canManage()}
                role={roleOf(message.userId)}
                onReply={(m) => { replyTo = m; inputEl?.focus(); }}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReact={react}
                onPin={pin}
                onJump={jumpTo}
                onImage={(file) => (viewer = file)}
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
          <Paperclip size={18} strokeWidth={1.8} />
        </button>
        <textarea
          bind:this={inputEl}
          bind:value={text}
          on:keydown={onKey}
          on:input={growInput}
          on:paste={onPaste}
          rows="1"
          placeholder={current ? `Написать в #${current.name}` : "Выбери канал"}
          disabled={!current}
        ></textarea>
        <div class="emoji-wrap">
          <button type="button" class="comp-btn" title="Эмодзи" aria-label="Эмодзи" on:click={() => (emojiOpen = !emojiOpen)}>
            <FaceSlightlySmiling size={18} strokeWidth={1.8} />
          </button>
          {#if emojiOpen}
            <div class="emoji-pop">
              <input class="emoji-search" bind:value={emojiSearch} placeholder="Поиск смайлика" />
              {#each customEmoji.filter((e) => e.name.includes(emojiSearch.toLowerCase())) as emoji (emoji.id)}
                <button type="button" title={`:${emoji.name}:`} on:click={() => { text += `:${emoji.name}:`; emojiOpen = false; inputEl?.focus(); }}><img src={fileUrl(emoji.url)} alt={emoji.name} /></button>
              {/each}
              {#each QUICK_EMOJI as emoji}
                <button type="button" on:click={() => { text += emoji; emojiOpen = false; inputEl?.focus(); }}>{emoji}</button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="send-btn" type="submit" aria-label="Отправить" disabled={uploading}>
          {#if uploading}
            <span>…</span>
          {:else}
            <Send size={18} strokeWidth={1.8} />
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

    {#each roleGroups as group (group.role.id)}
      <div class="mem-group">
        <h3><i class="rg-dot" style="background:{group.role.color}"></i>{group.role.name.toLowerCase()} — {group.list.length}</h3>
        {#each group.list as member (member.id)}
          <div class="mem">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={32} radius={10} dot={dotOf(member.id)} />
            <div class="mem-info">
              <div class="mem-name" style="color:{member.roles[0]?.color || 'inherit'}">{member.name}</div>
              <div class="mem-act">
                {STATUS_LABEL[statusOf(member.id)] || "в сети"}{member.roles.length ? ` · ${member.roles.map((r) => r.name).join(" · ")}` : ""}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/each}

    {#if looseOnline.length}
      <div class="mem-group">
        <h3>в сети — {looseOnline.length}</h3>
        {#each looseOnline as member (member.id)}
          <div class="mem">
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={32} radius={10} dot={dotOf(member.id)} />
            <div class="mem-info">
              <div class="mem-name">{member.name}</div>
              <div class="mem-act">{STATUS_LABEL[statusOf(member.id)] || "в сети"}</div>
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
            <Avatar name={member.name} color={member.color} avatar={member.avatar} size={32} radius={10} dot={OFFLINE_DOT} />
            <div class="mem-info">
              <div class="mem-name">{member.name}</div>
              <div class="mem-act">{lastSeenText(member.id)}</div>
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
    {voice}
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
          <label for="new-space-name">создать свой</label>
          <input
            id="new-space-name"
            class="set-input"
            bind:value={newName}
            placeholder="Название сервера"
            maxlength="40"
            on:keydown={(e) => e.key === "Enter" && createSpace()}
          />
        <button class="set-copy" disabled={busy || Number(newQuotaGiB) <= 0} on:click={createSpace}>Создать сервер</button>
        </div>
        <div class="set-field">
          <label for="new-space-quota">Место под медиа</label>
          <div class="quota-row"><input id="new-space-quota" class="set-input" type="number" min="0.0625" step="0.25" bind:value={newQuotaGiB} /><span>ГБ</span></div>
          {#if diskInfo}<small>Свободно для выделения: {Math.max(0, diskInfo.remaining / 1024 ** 3).toFixed(2)} ГБ (не более 80% диска VPS).</small>{/if}
        </div>
        <div class="new-sep"><span>или</span></div>
        <div class="set-field">
          <label for="join-code">войти по коду приглашения</label>
          <input
            id="join-code"
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

{#if viewer}
  <Lightbox file={viewer} on:close={() => (viewer = null)} />
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
    on:deleted={() => dropSpace(space.id)}
  />
{/if}
