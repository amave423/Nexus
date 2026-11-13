const S = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const ICONS = {
  hash: S('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  volume: S('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  mic: S('<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  micOff: S('<path d="M9 5a3 3 0 0 1 6 0v5M9 9v1a3 3 0 0 0 4.5 2.6"/><path d="M5 11a7 7 0 0 0 10.5 6.1M12 18v4"/><path d="M3 3l18 18"/>'),
  headphones: S('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2" y="14" width="4" height="7" rx="2"/><rect x="18" y="14" width="4" height="7" rx="2"/>'),
  headphonesOff: S('<path d="M4 15v-3a8 8 0 0 1 12.5-6.6"/><rect x="2" y="14" width="4" height="7" rx="2"/><rect x="18" y="14" width="4" height="7" rx="2"/><path d="M3 3l18 18"/>'),
  camera: S('<rect x="2" y="6" width="13" height="12" rx="3"/><path d="M15 10.5 22 7v10l-7-3.5"/>'),
  screen: S('<rect x="2" y="4" width="20" height="13" rx="2.5"/><path d="M8 21h8M12 17v4"/>'),
  users: S('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6.5 6.5 0 0 0-2-4.7"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  send: S('<path d="M4.5 12 20 4l-6.5 16-2.5-6.5L4.5 12z"/>'),
  smile: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  clip: S('<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>'),
  reply: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v3"/>'),
  react: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  more: S('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  chevron: S('<path d="m6 9 6 6 6-6"/>'),
  check: S('<path d="m4 12 5 5L20 6"/>'),
  expand: S('<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>'),
  phoneOff: S('<path d="M3 3l18 18"/><path d="M6.5 3.5 9 6l-1.5 3.5a12 12 0 0 0 6 6L17 14l2.5 2.5-1.5 3a2 2 0 0 1-2 1A16 16 0 0 1 3.5 6a2 2 0 0 1 1-2l2-.5z"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  bell: S('<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>'),
  palette: S('<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="1.2"/><circle cx="15" cy="9.5" r="1.2"/><circle cx="9.5" cy="15" r="1.2"/>'),
  keyboard: S('<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'),
  shield: S('<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3z"/>'),
  link: S('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'),
  warn: S('<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9v5M12 17h.01"/>'),
  play: S('<path d="M7 4.5 19 12 7 19.5z"/>'),
};

const USERS = {
  artem: { name: "Артём", color: "#c8ff3d", role: "owner", roleColor: "#c8ff3d" },
  mira: { name: "Мира", color: "#b18cff", role: "admin", roleColor: "#b18cff" },
  kostya: { name: "Костя", color: "#6fe3ff", role: "dev", roleColor: "#6fe3ff" },
  dasha: { name: "Даша", color: "#ff6b8a", role: "design", roleColor: "#ff6b8a" },
  lev: { name: "Лев", color: "#ffb454", role: "guest", roleColor: "#ffb454" },
};

const SERVERS = [
  { id: "nexus", label: "N", active: true },
  { id: "lab", label: "L" },
  { id: "art", label: "A" },
  { id: "game", label: "G" },
  { id: "add", label: "+", add: true },
];

const CHANNELS = [
  {
    group: "текст",
    items: [
      { id: "general", type: "text", name: "general", topic: "общий канал · здесь всё начинается" },
      { id: "design", type: "text", name: "дизайн", topic: "макеты, шрифты, цвет" },
      { id: "memes", type: "text", name: "мемы", topic: "без правил" },
      { id: "music", type: "text", name: "музыка", topic: "что играет прямо сейчас" },
    ],
  },
  {
    group: "голос",
    items: [
      { id: "kitchen", type: "voice", name: "Кухня", live: ["mira", "kostya", "dasha"] },
      { id: "game", type: "voice", name: "Игровая", live: [] },
      { id: "stream", type: "voice", name: "Стрим", live: ["lev"] },
    ],
  },
];

const MESSAGES = {
  general: [
    { div: "сегодня" },
    { u: "mira", t: "14:02", text: "Поднял новый сервер. <b>Одно ядро, гигабайт памяти</b> — и всё это должно летать.", react: [["🔥", 4, true], ["🫡", 2, false]] },
    { u: "kostya", t: "14:04", reply: ["Мира", "Поднял новый сервер. Одно ядро, гигабайт памяти…"], text: "Голос на WebRTC, шумодав на клиенте. Сервер только сигналит — звук идёт напрямую между людьми." },
    { u: "dasha", t: "14:07", text: "Тогда и дизайн не должен быть как у всех. Никаких левых панелей, никаких серых списков.", attach: { name: "layout-v3.png", size: "1.4 МБ · 2560×1440" } },
    { u: "artem", t: "14:09", text: "Согласен. Каналы — внизу, как пульт. Участники — справа, по требованию. Всё остальное — воздух.", react: [["💚", 3, true]] },
    { u: "lev", t: "14:11", text: "а где настройки" },
    { u: "kostya", t: "14:11", text: "в правом верхнем, как у людей", react: [["😄", 3, false]] },
  ],
  design: [
    { div: "сегодня" },
    { u: "dasha", t: "13:40", text: "Палитра: <code>#c8ff3d</code> как единственный акцент. Всё остальное — оттенки чернил.", react: [["🎨", 2, false]] },
    { u: "artem", t: "13:44", text: "Кислотный на чёрном — хорошо. Но не заливать им всё, только активное состояние." },
    { u: "mira", t: "13:51", text: "Шрифты: Space Grotesk для интерфейса, JetBrains Mono для метаданных. Время, статусы, счётчики — только моно." },
  ],
  memes: [
    { div: "сегодня" },
    { u: "lev", t: "12:20", text: "когда сервер на 1 гб, а пользователей 12", react: [["💀", 5, true]] },
    { u: "kostya", t: "12:22", text: "12 человек — это уже нагрузка, между прочим" },
  ],
  music: [
    { div: "сегодня" },
    { u: "kostya", t: "11:05", text: "В голосовом сейчас: <b>Burial — Archangel</b>. Заходите." },
  ],
};

const MEMBERS = [
  {
    group: "в сети",
    items: [
      { u: "artem", status: "#c8ff3d", act: "в голосовом", live: true },
      { u: "mira", status: "#c8ff3d", act: "в голосовом", live: true },
      { u: "kostya", status: "#c8ff3d", act: "в голосовом", live: true },
      { u: "dasha", status: "#c8ff3d", act: "в голосовом", live: true },
      { u: "lev", status: "#ff6b8a", act: "не беспокоить" },
    ],
  },
  {
    group: "не в сети",
    items: [
      { u: "artem", status: "#3a3a44", act: "был(а) 2 ч назад", off: true, alt: "Тимур" },
      { u: "dasha", status: "#3a3a44", act: "был(а) вчера", off: true, alt: "Ника" },
    ],
  },
];

const THEMES = { "Чернила": "ink", "Полночь": "night", "Контраст": "contrast" };
const DENSITY = { "Просторно": "wide", "Обычно": "normal", "Плотно": "compact" };
const SOUNDS = { "Мягкий": "soft", "Пинг": "ping", "Капля": "drop", "Аккорд": "chord" };
const ACCENTS = [["#c8ff3d", "кислота"], ["#6fe3ff", "лёд"], ["#ff6b8a", "роза"], ["#b18cff", "фиалка"], ["#ffb454", "янтарь"]];

/* ---------- preferences ---------- */
const PREF_KEY = "nexus.pref.v2";

const DEFAULTS = {
  theme: "Чернила", density: "Обычно", accent: "#c8ff3d", anim: true, bg: true,
  name: "Артём", about: "Собираю свой дискорд на одном ядре.", status: "в сети", dm: "Все с сервера",
  email: "artem@nexus.local", avatar: null,
  micDev: "Default — Realtek Audio", outDev: "Default — Наушники", micLevel: 62,
  noiseSup: true, echoCancel: true, autoGain: false, voiceMode: true, quality: "128 kbps",
  notifDesktop: true, notifSound: true, notifMention: true, dnd: false, sound: "Мягкий", volume: 60,
  keys: { mic: "Ctrl+M", deaf: "Ctrl+D", cam: "Ctrl+E", screen: "Ctrl+S", leave: "Ctrl+Q", search: "Ctrl+F" },
  srvVerify: "Все", srvSysMsg: true, srvDefaultRole: "Читать и писать",
  srvExpire: "Никогда", srvLimit: "Без лимита", srvTemp: false,
};

let PREF = loadPref();

function loadPref() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return { ...DEFAULTS, ...raw, keys: { ...DEFAULTS.keys, ...(raw.keys || {}) } };
  } catch (e) {
    return { ...DEFAULTS, keys: { ...DEFAULTS.keys } };
  }
}
function savePref() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(PREF));
  } catch (e) { /* переполнение хранилища — не критично */ }
}

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const initial = (n) => n.trim().charAt(0).toUpperCase();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const plural = (n, a, b, c) => {
  const m = n % 100, d = n % 10;
  if (m > 10 && m < 20) return c;
  if (d === 1) return a;
  if (d >= 2 && d <= 4) return b;
  return c;
};
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 70), g = Math.max(0, ((n >> 8) & 255) - 70), b = Math.max(0, (n & 255) - 70);
  return `rgb(${r},${g},${b})`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function avStyle(user, off = false) {
  if (!off && user === "artem" && PREF.avatar) return `background:url(${PREF.avatar}) center/cover`;
  if (off) return "background:linear-gradient(150deg,#3a3a44,#26262e)";
  const u = USERS[user];
  return `background:linear-gradient(150deg,${u.color},${shade(u.color)})`;
}
function avatarHTML(user, cls = "") {
  if (user === "artem" && PREF.avatar) return `<span class="avatar ${cls}" style="${avStyle(user)}"></span>`;
  return `<span class="avatar ${cls}" style="${avStyle(user)}">${initial(USERS[user].name)}</span>`;
}

/* ---------- state ---------- */
const VOICE = { mic: true, deaf: false, cam: false, screen: false };
let currentId = "general";
let roomMode = "ring";
let roomTimer = null;
let roomSeconds = 0;
let speakTimer = null;

const findChannel = (id) => {
  for (const g of CHANNELS) for (const c of g.items) if (c.id === id) return c;
  return null;
};
const isVoice = () => findChannel(currentId)?.type === "voice";

/* ---------- appearance ---------- */
function applyPref() {
  const root = document.documentElement;
  root.dataset.theme = THEMES[PREF.theme] || "ink";
  root.dataset.density = DENSITY[PREF.density] || "normal";
  root.style.setProperty("--acid", PREF.accent);
  root.style.setProperty("--acid-rgb", hexToRgb(PREF.accent));
  document.body.classList.toggle("no-anim", !PREF.anim);
  document.body.classList.toggle("no-bg", !PREF.bg);
  if ($("profileBtn")) $("profileBtn").innerHTML = avatarHTML("artem");
}

function refreshAll() {
  renderChannels();
  renderMembers();
  renderVoiceConsole();
  $("chanRail").querySelectorAll(".chan").forEach((b) => b.classList.toggle("active", b.dataset.id === currentId));
  if (isVoice()) {
    renderStage(findChannel(currentId), roomPeople(findChannel(currentId)));
    renderRoomControls();
  } else {
    renderStream(currentId);
  }
  applyPref();
}

/* ---------- звук ---------- */
let actx = null;
function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function blip(ctx, { f, t0 = 0, d = 0.2, type = "sine", g = 0.2, to = null }) {
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  const gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn);
  gn.connect(ctx.destination);
  o.start(t);
  o.stop(t + d + 0.03);
}
function playSound(label = PREF.sound, vol = PREF.volume / 100) {
  if (vol <= 0) return;
  let ctx;
  try { ctx = audioCtx(); } catch (e) { return; }
  const v = vol * 0.6;
  const kind = SOUNDS[label] || "soft";
  if (kind === "soft") {
    blip(ctx, { f: 587, d: 0.2, g: v * 0.5 });
    blip(ctx, { f: 880, t0: 0.11, d: 0.28, g: v * 0.4 });
  } else if (kind === "ping") {
    blip(ctx, { f: 1240, d: 0.45, g: v * 0.38, type: "triangle" });
    blip(ctx, { f: 1860, t0: 0.01, d: 0.32, g: v * 0.16 });
  } else if (kind === "drop") {
    blip(ctx, { f: 940, d: 0.32, g: v * 0.5, to: 300 });
  } else {
    [523, 659, 784].forEach((f, i) => blip(ctx, { f, t0: i * 0.06, d: 0.5, g: v * 0.28 }));
  }
}

function toast(user, text) {
  if (PREF.dnd) return;
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${avatarHTML(user)}<div class="toast-body">
      <div class="toast-top"><b>${USERS[user].name}</b><span># general</span></div>
      <div class="toast-text">${text}</div>
    </div>`;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, 4600);
}
function notify(user, text) {
  toast(user, text);
  if (PREF.notifSound) playSound();
}

/* ---------- render: chrome ---------- */
function renderServers() {
  $("servers").innerHTML = SERVERS.map(
    (s) => `<button class="coin ${s.active ? "active" : ""} ${s.add ? "add" : ""}" data-id="${s.id}">${s.label}</button>`
  ).join("");
  $("servers").querySelectorAll(".coin").forEach((c) => {
    c.addEventListener("click", () => {
      if (c.classList.contains("add")) return;
      if (c.classList.contains("active")) { openModal("server"); return; }
      $("servers").querySelectorAll(".coin").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
    });
  });
}

function renderChannels() {
  const rail = $("chanRail");
  rail.innerHTML = CHANNELS.map((g) => {
    const items = g.items.map((c) => {
      if (c.type === "voice") {
        const n = c.live.length + (c.id === currentId ? 1 : 0);
        return `<button class="chan voice" data-id="${c.id}">
          ${ICONS.volume}<span class="nm">${c.name}</span>
          ${n ? `<span class="chan-count">${n}</span>` : `<span class="live-dot" style="background:#3a3a44;box-shadow:none;animation:none"></span>`}
        </button>`;
      }
      return `<button class="chan" data-id="${c.id}">${ICONS.hash}<span class="nm">${c.name}</span></button>`;
    }).join("");
    return `<span class="chan-group">${g.group}</span>${items}`;
  }).join("");

  rail.querySelectorAll(".chan").forEach((b) => b.addEventListener("click", () => openChannel(b.dataset.id)));
}

function renderMembers() {
  const total = MEMBERS.reduce((a, g) => a + g.items.length, 0);
  $("members").innerHTML = `
    <div class="mem-head"><span>участники</span><span class="count">${total}</span></div>
    ${MEMBERS.map((g) => `
      <div class="mem-group">
        <h3>${g.group} — ${g.items.length}</h3>
        ${g.items.map((m) => {
          const u = USERS[m.u];
          const name = m.alt || (m.u === "artem" ? PREF.name : u.name);
          return `<div class="mem ${m.off ? "off" : ""}">
            <span class="avatar" style="${avStyle(m.u, m.off)}">
              ${m.u === "artem" && PREF.avatar && !m.off ? "" : initial(name)}
              <span class="status" style="background:${m.status}"></span>
            </span>
            <div class="mem-info">
              <div class="mem-name">${esc(name)}</div>
              <div class="mem-act ${m.live ? "live" : ""}">${m.act}</div>
            </div>
          </div>`;
        }).join("")}
      </div>`).join("")}`;
}

function renderVoiceConsole() {
  $("voiceSeg").innerHTML = `
    <div class="voice-top">
      <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="voice-info">
        <span class="lbl">в голосовом</span>
        <span class="nm">Кухня · 4</span>
      </div>
    </div>
    <div class="voice-btns">
      <button class="vbtn ${VOICE.mic ? "" : "off"}" data-act="mic" title="Микрофон">${VOICE.mic ? ICONS.mic : ICONS.micOff}</button>
      <button class="vbtn ${VOICE.deaf ? "off" : ""}" data-act="deaf" title="Звук">${VOICE.deaf ? ICONS.headphonesOff : ICONS.headphones}</button>
      <button class="vbtn ${VOICE.cam ? "on" : ""}" data-act="cam" title="Камера">${ICONS.camera}</button>
      <button class="vbtn ${VOICE.screen ? "on" : ""}" data-act="screen" title="Стрим">${ICONS.screen}</button>
      <button class="vbtn leave" data-act="leave" title="Отключиться">${ICONS.phoneOff}</button>
    </div>`;
  $("voiceSeg").querySelectorAll(".vbtn").forEach((b) => b.addEventListener("click", () => voiceAction(b.dataset.act)));
  $("voiceSeg").classList.toggle("muted", !VOICE.mic);
}

/* ---------- render: text ---------- */
function renderStream(id) {
  const list = MESSAGES[id] || [{ div: "сегодня" }, { u: "mira", t: "—", text: "Тут пока тихо." }];
  const stream = $("stream");
  stream.innerHTML = `<div class="stream-inner">` + list.map((m) => {
    if (m.div) return `<div class="divider"><div class="g"></div><div class="l"><span>${m.div}</span></div></div>`;
    const u = USERS[m.u];
    const reply = m.reply ? `<div class="reply"><b>${m.reply[0]}</b><span>${m.reply[1]}</span></div>` : "";
    const react = m.react
      ? `<div class="reactions">${m.react.map(([e, n, mine]) =>
          `<button class="reaction ${mine ? "mine" : ""}"><span>${e}</span><span class="n">${n}</span></button>`).join("")}</div>` : "";
    const attach = m.attach
      ? `<div class="attach"><div class="attach-img"></div><div class="attach-meta"><b>${m.attach.name}</b><span>${m.attach.size}</span></div></div>` : "";
    return `<div class="msg">
      <div class="msg-gutter"><time>${m.t}</time></div>
      <div class="msg-body">
        ${reply}
        <div class="msg-head">
          ${avatarHTML(m.u)}
          <span class="name">${m.u === "artem" ? esc(PREF.name) : u.name}</span>
          <span class="role" style="color:${u.roleColor}">${u.role}</span>
          <span class="stamp">${m.t}</span>
        </div>
        <div class="msg-text">${m.text}</div>
        ${attach}${react}
      </div>
      <div class="msg-actions">
        <button title="Ответить">${ICONS.reply}</button>
        <button title="Реакция">${ICONS.react}</button>
        <button title="Ещё">${ICONS.more}</button>
      </div>
    </div>`;
  }).join("") + `</div>`;
  stream.scrollTop = stream.scrollHeight;
}

/* ---------- render: voice room ---------- */
function roomPeople(ch) {
  return ["artem", ...(ch.live || [])];
}

function renderRoom(ch) {
  const people = roomPeople(ch);
  $("room").innerHTML = `
    <div class="room-head">
      <div class="room-title">
        <span class="live-dot"></span>
        <h2>${ch.name}</h2>
        <span class="room-timer" id="roomTimer">00:00</span>
      </div>
      <div class="room-meta">${people.length} ${plural(people.length, "участник", "участника", "участников")} · opus 48 kHz · ${PREF.quality}</div>
    </div>
    <div class="room-stage" id="roomStage"></div>
    <div class="room-controls" id="roomControls"></div>`;
  renderStage(ch, people);
  renderRoomControls();
  startRoomTimer();
}

function renderStage(ch, people) {
  const stage = $("roomStage");
  if (!stage) return;

  if (roomMode === "stream") {
    const who = VOICE.screen ? "artem" : ((ch.live && ch.live[0]) || "artem");
    const viewers = Math.max(0, people.length - 1);
    const whoText = who === "artem" ? "Ты стримишь" : `${USERS[who].name} стримит`;
    stage.innerHTML = `
      <div class="stream-view">
        <div class="stream-feed" id="streamFeed">
          <div class="mock">
            <div class="mock-bar"><i></i><i></i><i></i><b>nexus.local — общий экран</b></div>
            <div class="mock-cols">
              <div class="mock-col">
                <span style="width:70%"></span><span style="width:52%"></span><span style="width:64%"></span>
                <span style="width:40%"></span><span style="width:78%"></span>
              </div>
              <div class="mock-col">
                <span style="width:88%"></span><span style="width:46%"></span><span style="width:76%"></span>
                <span style="width:58%"></span><span style="width:34%"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="stream-badge"><span class="live-dot"></span>LIVE</div>
        <div class="stream-who">${whoText} · ${viewers} ${plural(viewers, "смотрит", "смотрят", "смотрят")}</div>
        <button class="fs-btn" id="fsBtn">${ICONS.expand}<span>На весь экран</span></button>
        <div class="stream-strip">
          ${people.map((u) => `<span class="strip-av" style="${avStyle(u)}">${u === "artem" && PREF.avatar ? "" : initial(USERS[u].name)}</span>`).join("")}
        </div>
      </div>`;
    $("fsBtn").addEventListener("click", () => {
      const f = $("streamFeed");
      if (document.fullscreenElement) document.exitFullscreen();
      else f.requestFullscreen?.();
    });
    return;
  }

  if (roomMode === "cams") {
    stage.innerHTML = `<div class="cams">${people.map((u, i) => `
      <div class="cam" style="--i:${i}">
        <div class="cam-feed" style="--c:${USERS[u].color}"></div>
        <span class="cam-name">${u === "artem" ? esc(PREF.name) : USERS[u].name}${u === "artem" ? " · ты" : ""}</span>
        <span class="cam-mic">${ICONS.mic}</span>
      </div>`).join("")}</div>`;
    return;
  }

  const n = people.length;
  const maxR = Math.min(stage.clientWidth || 420, stage.clientHeight || 420) / 2 - 46;
  const radius = Math.round(Math.max(86, Math.min(180, maxR)));
  stage.innerHTML = `
    <div class="ring" data-n="${n}" style="--r:${radius}px">
      <div class="orb">
        <span class="orb-ring"></span>
        <span class="orb-ring r2"></span>
        <span class="orb-core"></span>
      </div>
      ${people.map((u, i) => {
        const a = (360 / n) * i - 90;
        return `<div class="seat" style="--a:${a}deg" data-u="${u}">
          <span class="seat-av" style="${avStyle(u)}">${u === "artem" && PREF.avatar ? "" : initial(USERS[u].name)}</span>
          <span class="seat-name">${u === "artem" ? esc(PREF.name) : USERS[u].name}${u === "artem" ? " · ты" : ""}</span>
        </div>`;
      }).join("")}
      ${n === 1 ? `<p class="room-empty">тут пока никого · позови своих</p>` : ""}
    </div>`;
  startSpeaking();
}

function renderRoomControls() {
  const box = $("roomControls");
  if (!box) return;
  box.innerHTML = `
    <button class="rbtn ${VOICE.mic ? "" : "off"}" data-act="mic" title="Микрофон (${PREF.keys.mic})">${VOICE.mic ? ICONS.mic : ICONS.micOff}</button>
    <button class="rbtn ${VOICE.deaf ? "off" : ""}" data-act="deaf" title="Звук (${PREF.keys.deaf})">${VOICE.deaf ? ICONS.headphonesOff : ICONS.headphones}</button>
    <button class="rbtn ${VOICE.cam ? "on" : ""}" data-act="cam" title="Камера (${PREF.keys.cam})">${ICONS.camera}</button>
    <button class="rbtn ${VOICE.screen ? "on" : ""}" data-act="screen" title="Стрим (${PREF.keys.screen})">${ICONS.screen}</button>
    <button class="rbtn leave" data-act="leave">${ICONS.phoneOff}<span>Выйти</span></button>`;
  box.querySelectorAll(".rbtn").forEach((b) => b.addEventListener("click", () => voiceAction(b.dataset.act)));
}

function startSpeaking() {
  clearInterval(speakTimer);
  const seats = [...document.querySelectorAll(".seat")];
  if (!seats.length) return;
  let i = 0;
  const orb = document.querySelector(".orb");
  const tick = () => {
    seats.forEach((s) => s.classList.remove("speaking"));
    seats[i % seats.length].classList.add("speaking");
    orb?.classList.add("active");
    i++;
  };
  tick();
  speakTimer = setInterval(tick, 2400);
}

function startRoomTimer() {
  clearInterval(roomTimer);
  roomSeconds = 0;
  const paint = () => {
    const t = $("roomTimer");
    if (!t) return;
    const m = String(Math.floor(roomSeconds / 60)).padStart(2, "0");
    const s = String(roomSeconds % 60).padStart(2, "0");
    t.textContent = `${m}:${s}`;
  };
  paint();
  roomTimer = setInterval(() => { roomSeconds++; paint(); }, 1000);
}

/* ---------- actions ---------- */
function voiceAction(act) {
  if (act === "leave") {
    openChannel("general");
    return;
  }
  if (act === "mic") { VOICE.mic = !VOICE.mic; playSound("Капля", PREF.volume / 140); }
  if (act === "deaf") VOICE.deaf = !VOICE.deaf;
  if (act === "cam") VOICE.cam = !VOICE.cam;
  if (act === "screen") VOICE.screen = !VOICE.screen;

  if (act === "cam" || act === "screen") {
    if (VOICE.screen) roomMode = "stream";
    else if (VOICE.cam) roomMode = "cams";
    else roomMode = "ring";
  }
  syncVoice();
}

function syncVoice() {
  renderVoiceConsole();
  if (isVoice()) {
    const ch = findChannel(currentId);
    renderStage(ch, roomPeople(ch));
    renderRoomControls();
  }
  $("pip").hidden = !(VOICE.cam && !isVoice());
}

function openChannel(id) {
  const ch = findChannel(id);
  if (!ch) return;
  currentId = id;
  renderChannels();
  $("chanRail").querySelectorAll(".chan").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
  if ($("chanName")) $("chanName").textContent = ch.name;
  if ($("chanGlyph")) $("chanGlyph").innerHTML = ch.type === "voice" ? ICONS.volume : ICONS.hash;
  document.body.classList.remove("nav-open");

  const wrap = $("streamWrap");
  document.body.classList.toggle("in-voice", ch.type === "voice");
  if (ch.type === "voice") {
    const n = roomPeople(ch).length;
    if ($("chanTopic")) $("chanTopic").textContent = `голосовой канал · ${n} ${plural(n, "участник", "участника", "участников")}`;
    wrap.classList.add("voice-mode");
    $("room").hidden = false;
    roomMode = VOICE.screen ? "stream" : VOICE.cam ? "cams" : "ring";
    renderRoom(ch);
  } else {
    if ($("chanTopic")) $("chanTopic").textContent = ch.topic || "";
    wrap.classList.remove("voice-mode");
    $("room").hidden = true;
    clearInterval(roomTimer);
    clearInterval(speakTimer);
    $("input").placeholder = `Написать в #${ch.name}`;
    renderStream(id);
  }
  syncVoice();
}

/* ---------- settings ui kit ---------- */
const row = (title, desc, control) =>
  `<div class="set-row"><div class="set-row-t"><b>${title}</b>${desc ? `<span>${desc}</span>` : ""}</div>${control}</div>`;
const sw = (on, key) => `<button class="switch ${on ? "on" : ""}" data-key="${key || ""}" role="switch" aria-checked="${on}"><i></i></button>`;
const field = (label, inner) => `<div class="set-field"><label>${label}</label>${inner}</div>`;

function dd(key, opts, current) {
  return `<div class="dd" data-key="${key}">
    <button class="dd-btn" type="button"><span>${esc(current)}</span>${ICONS.chevron}</button>
    <div class="dd-list">${opts.map((o) =>
      `<button class="dd-opt ${o === current ? "on" : ""}" data-v="${esc(o)}" type="button"><span>${esc(o)}</span>${o === current ? ICONS.check : ""}</button>`
    ).join("")}</div>
  </div>`;
}

function keyset(action) {
  const parts = (PREF.keys[action] || "").split("+");
  return `<button class="keyset" data-keys="${action}">${parts.map((p) => `<span class="kbd">${esc(p)}</span>`).join("<i>+</i>")}</button>`;
}

/* ---------- settings modals ---------- */
const MODALS = {
  user: {
    title: "Настройки",
    nav: [
      { grp: "аккаунт" },
      { id: "profile", label: "Профиль", icon: ICONS.users },
      { id: "voice", label: "Голос и видео", icon: ICONS.mic },
      { grp: "приложение" },
      { id: "notify", label: "Уведомления", icon: ICONS.bell },
      { id: "look", label: "Внешний вид", icon: ICONS.palette },
      { id: "keys", label: "Горячие клавиши", icon: ICONS.keyboard },
    ],
    panes: {
      profile: () => `
        <div class="set-profile">
          <div class="avatar-up" id="avatarUp">
            <span class="set-avatar" style="${avStyle("artem")}">${PREF.avatar ? "" : initial(PREF.name)}</span>
            <span class="avatar-up-hint">сменить</span>
          </div>
          <div class="who"><b>${esc(PREF.name)}</b><span>@artem · owner</span></div>
          ${PREF.avatar ? `<button class="ghost-btn" id="avatarReset" style="margin-left:auto">Сбросить</button>` : ""}
        </div>
        <input type="file" id="avatarFile" accept="image/*" hidden>
        ${field("Отображаемое имя", `<input class="set-input" id="prefName" value="${esc(PREF.name)}">`)}
        ${field("О себе", `<textarea class="set-input" id="prefAbout">${esc(PREF.about)}</textarea>`)}
        ${row("Статус", "Что видят остальные рядом с твоим именем", dd("status", ["в сети", "отошёл", "не беспокоить", "невидимка"], PREF.status))}
        ${row("Личные сообщения", "Кто может писать тебе напрямую", dd("dm", ["Все с сервера", "Только друзья", "Никто"], PREF.dm))}
        ${row("Почта", "Куда писать, если тебя долго нет", `<input class="set-input" id="prefEmail" style="max-width:230px" value="${esc(PREF.email)}">`)}`,

      voice: () => `
        ${row("Микрофон", "Устройство ввода", dd("micDev", ["Default — Realtek Audio", "HyperX QuadCast", "Виртуальный кабель"], PREF.micDev))}
        ${row("Выход", "Устройство вывода", dd("outDev", ["Default — Наушники", "Колонки"], PREF.outDev))}
        <div class="set-field">
          <label>Уровень микрофона · ${PREF.micLevel}%</label>
          <input type="range" class="set-range" id="micLevel" min="0" max="100" value="${PREF.micLevel}">
        </div>
        <div class="vtest" id="vtest">
          <div class="vtest-head">
            <b>Проверка микрофона</b>
            <span>Послушай, как тебя слышно, до того как зайти в комнату</span>
          </div>
          <div class="vtest-meter" id="micMeter">${Array.from({ length: 28 }, () => "<i></i>").join("")}</div>
          <div class="vtest-status" id="micStatus">микрофон не запущен</div>
          <div class="vtest-actions">
            <button class="set-copy" id="micTest">Проверить</button>
            <button class="ghost-btn" id="micRec">Записать 3 сек</button>
            <button class="ghost-btn" id="micPlay" disabled>Прослушать</button>
          </div>
        </div>
        ${row("Шумоподавление", "Убирает фон: клавиатуру, вентилятор, улицу", sw(PREF.noiseSup, "noiseSup"))}
        ${row("Эхоподавление", "Гасит эхо, когда слушаешь в колонках", sw(PREF.echoCancel, "echoCancel"))}
        ${row("Автоусиление", "Подтягивает тихий голос", sw(PREF.autoGain, "autoGain"))}
        ${row("Режим речи", "Приглушать остальных, пока говоришь ты", sw(PREF.voiceMode, "voiceMode"))}
        ${row("Качество", "Битрейт звука в комнате", dd("quality", ["64 kbps", "96 kbps", "128 kbps"], PREF.quality))}`,

      notify: () => `
        ${row("Уведомления на рабочем столе", "Всплывающие окна, когда вкладка свёрнута", sw(PREF.notifDesktop, "notifDesktop"))}
        ${row("Звук уведомлений", "Короткий сигнал на новое сообщение", sw(PREF.notifSound, "notifSound"))}
        ${row("Упоминания", "Всегда подсвечивать @упоминания", sw(PREF.notifMention, "notifMention"))}
        ${row("Не беспокоить", "Скрыть все уведомления", sw(PREF.dnd, "dnd"))}
        ${row("Звук", "Как звучит уведомление", dd("sound", ["Мягкий", "Пинг", "Капля", "Аккорд"], PREF.sound))}
        <div class="set-field">
          <label>Громкость · ${PREF.volume}%</label>
          <input type="range" class="set-range" id="notifVol" min="0" max="100" value="${PREF.volume}">
        </div>
        ${row("Проверить", "Покажем, как это выглядит и звучит", `<button class="set-copy" id="notifTest">Пример</button>`)}`,

      look: () => `
        ${row("Тема", "Чернила, холодная полночь или жёсткий контраст", dd("theme", ["Чернила", "Полночь", "Контраст"], PREF.theme))}
        ${row("Плотность", "Сколько сообщений влезает на экран", dd("density", ["Просторно", "Обычно", "Плотно"], PREF.density))}
        ${row("Акцент", "Единственный цвет, который что-то значит", `<div class="set-swatches">${ACCENTS.map(([c, n]) =>
          `<button class="swatch ${c === PREF.accent ? "on" : ""}" data-accent="${c}" title="${n}" style="background:${c}"></button>`).join("")}</div>`)}
        ${row("Анимации", "Волны, свечение, переходы", sw(PREF.anim, "anim"))}
        ${row("Фон", "Размытые пятна за интерфейсом", sw(PREF.bg, "bg"))}`,

      keys: () => `
        <p class="set-hint">Нажми на сочетание и введи новое — оно сохранится и будет работать в приложении.</p>
        ${row("Микрофон", "Вкл / выкл", keyset("mic"))}
        ${row("Звук", "Вкл / выкл", keyset("deaf"))}
        ${row("Камера", "Вкл / выкл", keyset("cam"))}
        ${row("Стрим", "Начать / остановить", keyset("screen"))}
        ${row("Выйти из комнаты", "Отключиться от голоса", keyset("leave"))}
        ${row("Поиск", "Открыть поиск по каналу", keyset("search"))}
        <button class="ghost-btn" id="keysReset" style="align-self:flex-start">Сбросить все</button>`,
    },
  },
  server: {
    title: "Настройки сервера",
    nav: [
      { grp: "сервер" },
      { id: "overview", label: "Обзор", icon: ICONS.shield },
      { id: "roles", label: "Роли", icon: ICONS.users },
      { id: "members", label: "Участники", icon: ICONS.users },
      { id: "invites", label: "Приглашения", icon: ICONS.link },
      { grp: "опасное" },
      { id: "danger", label: "Удаление", icon: ICONS.warn },
    ],
    panes: {
      overview: () => `
        <div class="set-profile">
          <span class="set-avatar" style="background:linear-gradient(150deg,#c8ff3d,#8fbf1f)">N</span>
          <div class="who"><b>NEXUS</b><span>12 участников · создан 3 дня назад</span></div>
        </div>
        ${field("Название сервера", `<input class="set-input" value="NEXUS">`)}
        ${field("Описание", `<textarea class="set-input">Голосовая комната для своих.</textarea>`)}
        ${row("Уровень проверки", "Кто может писать в каналы", dd("srvVerify", ["Все", "Только участники", "Только роли"], PREF.srvVerify))}
        ${row("Системные сообщения", "Показывать входы и выходы в ленте", sw(PREF.srvSysMsg, "srvSysMsg"))}`,

      roles: () => `
        ${row("Роли", "Цвет и права. Выше — важнее", `<button class="set-copy" id="roleNew">Создать</button>`)}
        ${[["owner", "#c8ff3d", 1], ["admin", "#b18cff", 1], ["dev", "#6fe3ff", 2], ["design", "#ff6b8a", 1], ["guest", "#ffb454", 7]]
          .map(([n, c, k]) => `<div class="set-role"><span class="dot" style="background:${c}"></span><span class="nm">${n}</span><span class="cnt">${k} ${plural(k, "человек", "человека", "человек")}</span></div>`).join("")}
        ${row("Права по умолчанию", "Что может новый участник", dd("srvDefaultRole", ["Читать и писать", "Только читать", "Ничего"], PREF.srvDefaultRole))}`,

      members: () => `
        ${row("Участники", "12 человек на сервере", `<input class="set-input" id="memSearch" style="max-width:210px" placeholder="Поиск по имени">`)}
        <div id="memList">
        ${MEMBERS.flatMap((g) => g.items).map((m) => {
          const u = USERS[m.u];
          const name = m.alt || (m.u === "artem" ? PREF.name : u.name);
          return `<div class="set-role">
            <span class="avatar" style="width:26px;height:26px;border-radius:8px;font-size:10px;${avStyle(m.u, m.off)}">${m.off || (m.u === "artem" && PREF.avatar) ? "" : initial(name)}</span>
            <span class="nm">${esc(name)}</span>
            <span class="cnt">${m.off ? "не в сети" : "в сети"}</span>
          </div>`;
        }).join("")}
        </div>`,

      invites: () => `
        ${field("Ссылка-приглашение", `<div class="set-invite"><input class="set-input" value="nexus.gg/kuhnya-2026" readonly><button class="set-copy">Копировать</button></div>`)}
        ${row("Срок действия", "Когда ссылка перестанет работать", dd("srvExpire", ["Никогда", "1 день", "7 дней", "30 дней"], PREF.srvExpire))}
        ${row("Лимит входов", "Сколько человек может зайти", dd("srvLimit", ["Без лимита", "5", "10", "25"], PREF.srvLimit))}
        ${row("Временный канал", "Создавать комнату при входе", sw(PREF.srvTemp, "srvTemp"))}`,

      danger: () => `
        <div class="set-danger">
          <b>Удалить сервер</b>
          <span>Все каналы, сообщения и роли исчезнут. Отменить это будет нельзя.</span>
          <button>Удалить NEXUS</button>
        </div>
        <div class="set-danger">
          <b>Передать владение</b>
          <span>Ты перестанешь быть владельцем. Обратно это уже не вернуть.</span>
          <button>Передать</button>
        </div>`,
    },
  },
};

let modalKind = null;
let modalTab = null;
let capturing = null;

function renderModalNav() {
  const m = MODALS[modalKind];
  $("setNav").innerHTML = m.nav.map((n) => n.grp
    ? `<span class="grp">${n.grp}</span>`
    : `<button data-tab="${n.id}" class="${n.id === modalTab ? "active" : ""}">${n.icon}<span>${n.label}</span></button>`
  ).join("");
  $("setNav").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    modalTab = b.dataset.tab;
    stopMeter();
    renderModalNav();
    renderModalPane();
  }));
}

function renderModalPane() {
  const pane = $("setPane");
  stopMeter();
  pane.innerHTML = MODALS[modalKind].panes[modalTab]();
  pane.scrollTop = 0;
  bindPane(pane);
}

function bindPane(pane) {
  pane.querySelectorAll(".dd-btn").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = b.closest(".dd");
    const wasOpen = dd.classList.contains("open");
    pane.querySelectorAll(".dd").forEach((x) => x.classList.remove("open"));
    if (!wasOpen) dd.classList.add("open");
  }));

  pane.querySelectorAll(".dd-opt").forEach((o) => o.addEventListener("click", () => {
    const dd = o.closest(".dd");
    PREF[dd.dataset.key] = o.dataset.v;
    savePref();
    applyPref();
    if (dd.dataset.key === "theme" || dd.dataset.key === "density") {
      if (isVoice()) renderStage(findChannel(currentId), roomPeople(findChannel(currentId)));
    }
    renderModalPane();
  }));

  pane.querySelectorAll(".switch").forEach((s) => s.addEventListener("click", () => {
    s.classList.toggle("on");
    const on = s.classList.contains("on");
    s.setAttribute("aria-checked", on);
    if (s.dataset.key) {
      PREF[s.dataset.key] = on;
      savePref();
      applyPref();
    }
  }));

  pane.querySelectorAll(".swatch").forEach((s) => s.addEventListener("click", () => {
    PREF.accent = s.dataset.accent;
    savePref();
    applyPref();
    renderModalPane();
  }));

  pane.querySelectorAll(".keyset").forEach((k) => k.addEventListener("click", () => {
    capturing = k.dataset.keys;
    k.classList.add("listening");
    k.innerHTML = `<span class="kbd">…</span><i>нажми</i>`;
  }));

  const copy = pane.querySelector(".set-copy");
  if (copy && copy.previousElementSibling?.tagName === "INPUT" && copy.previousElementSibling.readOnly) {
    copy.addEventListener("click", () => {
      const inp = copy.previousElementSibling;
      inp.select();
      navigator.clipboard?.writeText(inp.value);
      copy.textContent = "Скопировано";
      setTimeout(() => (copy.textContent = "Копировать"), 1600);
    });
  }

  bindPaneExtras(pane);
}

function bindPaneExtras(pane) {
  const name = pane.querySelector("#prefName");
  if (name) name.addEventListener("input", () => { PREF.name = name.value || "Артём"; savePref(); refreshAll(); });
  const about = pane.querySelector("#prefAbout");
  if (about) about.addEventListener("input", () => { PREF.about = about.value; savePref(); });
  const email = pane.querySelector("#prefEmail");
  if (email) email.addEventListener("input", () => { PREF.email = email.value; savePref(); });

  const micLevel = pane.querySelector("#micLevel");
  if (micLevel) micLevel.addEventListener("input", () => {
    PREF.micLevel = +micLevel.value;
    micLevel.closest(".set-field").querySelector("label").textContent = `Уровень микрофона · ${PREF.micLevel}%`;
    savePref();
  });
  const vol = pane.querySelector("#notifVol");
  if (vol) vol.addEventListener("change", () => {
    PREF.volume = +vol.value;
    vol.closest(".set-field").querySelector("label").textContent = `Громкость · ${PREF.volume}%`;
    savePref();
    playSound();
  });

  const avatarUp = pane.querySelector("#avatarUp");
  const file = pane.querySelector("#avatarFile");
  if (avatarUp && file) {
    avatarUp.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        PREF.avatar = await resizeImage(f, 176);
        savePref();
        refreshAll();
        renderModalPane();
      } catch (e) { /* файл не картинка */ }
    });
  }
  const reset = pane.querySelector("#avatarReset");
  if (reset) reset.addEventListener("click", () => {
    PREF.avatar = null;
    savePref();
    refreshAll();
    renderModalPane();
  });

  const micTest = pane.querySelector("#micTest");
  if (micTest) micTest.addEventListener("click", () => startMeter());
  const micRec = pane.querySelector("#micRec");
  if (micRec) micRec.addEventListener("click", () => recordMic());
  const micPlay = pane.querySelector("#micPlay");
  if (micPlay) micPlay.addEventListener("click", () => { if (mic.url) new Audio(mic.url).play(); });

  const notifTest = pane.querySelector("#notifTest");
  if (notifTest) notifTest.addEventListener("click", () => {
    notify("mira", "Загляни в голосовой — там уже собрались.");
  });

  const keysReset = pane.querySelector("#keysReset");
  if (keysReset) keysReset.addEventListener("click", () => {
    PREF.keys = { ...DEFAULTS.keys };
    savePref();
    renderModalPane();
  });

  const memSearch = pane.querySelector("#memSearch");
  if (memSearch) memSearch.addEventListener("input", () => {
    const q = memSearch.value.trim().toLowerCase();
    pane.querySelectorAll("#memList .set-role").forEach((r) => {
      r.style.display = r.querySelector(".nm").textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
}

function openModal(kind, tab) {
  modalKind = kind;
  const m = MODALS[kind];
  modalTab = tab || m.nav.find((n) => n.id).id;
  $("setTitle").textContent = m.title;
  renderModalNav();
  renderModalPane();
  $("modal").hidden = false;
}

function closeModal() {
  capturing = null;
  stopMeter();
  $("modal").hidden = true;
}

/* ---------- микрофон ---------- */
const mic = { stream: null, ctx: null, an: null, raf: 0, rec: null, chunks: [], url: null, fake: false };

function micBars() {
  const box = $("vtest");
  return box ? [...box.querySelectorAll(".vtest-meter i")] : [];
}

async function startMeter() {
  const box = $("vtest");
  if (!box) return;
  const status = $("micStatus");
  const bars = micBars();
  stopMeter();

  try {
    if (!mic.stream) {
      mic.stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: PREF.noiseSup, echoCancellation: PREF.echoCancel, autoGainControl: PREF.autoGain },
      });
      mic.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = mic.ctx.createMediaStreamSource(mic.stream);
      mic.an = mic.ctx.createAnalyser();
      mic.an.fftSize = 1024;
      src.connect(mic.an);
    }
  } catch (e) {
    status.textContent = "нет доступа к микрофону · показываю пример";
    status.classList.add("err");
    box.classList.add("live");
    let f = 0;
    const fake = () => {
      const lvl = Math.abs(Math.sin(f++ * 0.09)) * (0.55 + Math.random() * 0.45);
      bars.forEach((b, i) => { b.style.height = `${6 + lvl * (30 + Math.sin(i * 0.8 + f * 0.2) * 8)}px`; });
      mic.raf = requestAnimationFrame(fake);
    };
    fake();
    return;
  }

  status.textContent = "микрофон активен · говори";
  status.classList.remove("err");
  box.classList.add("live");

  const data = new Uint8Array(mic.an.fftSize);
  const loop = () => {
    mic.an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    const lvl = Math.min(1, Math.sqrt(sum / data.length) * 7);
    bars.forEach((b, i) => {
      b.style.height = `${6 + lvl * (28 + Math.sin(i * 0.9 + performance.now() * 0.004) * 10)}px`;
    });
    mic.raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopMeter() {
  if (mic.raf) cancelAnimationFrame(mic.raf);
  mic.raf = 0;
  const box = $("vtest");
  if (box) box.classList.remove("live");
}

async function recordMic() {
  const status = $("micStatus");
  if (!mic.stream) await startMeter();
  if (!mic.stream || !window.MediaRecorder) {
    if (status) status.textContent = "запись не поддерживается браузером";
    return;
  }
  mic.chunks = [];
  const rec = new MediaRecorder(mic.stream);
  mic.rec = rec;
  rec.ondataavailable = (e) => { if (e.data.size) mic.chunks.push(e.data); };
  rec.onstop = () => {
    if (mic.url) URL.revokeObjectURL(mic.url);
    mic.url = URL.createObjectURL(new Blob(mic.chunks, { type: "audio/webm" }));
    const pb = $("micPlay");
    if (pb) pb.disabled = false;
    const st = $("micStatus");
    if (st) { st.textContent = "запись готова · жми «Прослушать»"; st.classList.remove("err"); }
  };
  rec.start();
  if (status) status.textContent = "запись 3 секунды…";
  setTimeout(() => { try { rec.stop(); } catch (e) { /* уже остановлен */ } }, 3000);
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

/* ---------- горячие клавиши ---------- */
function comboFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Win");
  let k = e.code;
  if (k.startsWith("Key")) k = k.slice(3);
  else if (k.startsWith("Digit")) k = k.slice(5);
  else if (k.startsWith("Numpad")) k = "Num" + k.slice(6);
  else if (!/^(F\d{1,2}|Arrow\w+|Space|Enter|Tab|Escape|Backspace|Delete|Home|End)$/.test(k)) return null;
  if (!mods.length) return null;
  return [...mods, k].join("+");
}

function handleKeydown(e) {
  if (capturing) {
    e.preventDefault();
    if (e.key === "Escape") { capturing = null; renderModalPane(); return; }
    const combo = comboFromEvent(e);
    if (combo) {
      PREF.keys[capturing] = combo;
      savePref();
      capturing = null;
      renderModalPane();
    }
    return;
  }
  if (e.key === "Escape") {
    if (!$("modal").hidden) { closeModal(); return; }
    document.body.classList.remove("nav-open");
    return;
  }
  const combo = comboFromEvent(e);
  if (!combo) return;
  const act = Object.keys(PREF.keys).find((k) => PREF.keys[k] === combo);
  if (!act) return;
  e.preventDefault();
  if (act === "leave") { if (isVoice()) openChannel("general"); }
  else if (act === "search") { $("searchBtn")?.click(); }
  else if (act === "mic") voiceAction("mic");
  else if (isVoice()) voiceAction(act);
}

/* ---------- wire ---------- */
function wire() {
  $("searchBtn").innerHTML = ICONS.search;
  $("membersBtn").innerHTML = ICONS.users;
  $("attachBtn").innerHTML = ICONS.clip;
  $("emojiBtn").innerHTML = ICONS.smile;
  $("menuBtn").innerHTML = ICONS.menu;
  $("setClose").innerHTML = ICONS.close;
  document.querySelector(".send-btn").innerHTML = ICONS.send;

  $("profileBtn").addEventListener("click", () => openModal("user"));
  $("setClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("click", () => {
    document.querySelectorAll(".dd.open").forEach((x) => x.classList.remove("open"));
  });

  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));

  $("membersBtn").addEventListener("click", () => {
    const stage = $("stage");
    stage.classList.toggle("hide-members");
    $("membersBtn").classList.toggle("on", !stage.classList.contains("hide-members"));
  });

  const mq = window.matchMedia("(max-width: 860px)");
  const syncLayout = () => {
    $("stage").classList.toggle("hide-members", mq.matches);
    $("membersBtn").classList.toggle("on", !mq.matches);
    document.body.classList.remove("nav-open");
  };
  syncLayout();
  mq.addEventListener("change", syncLayout);

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("input");
    const text = input.value.trim();
    if (!text) return;
    (MESSAGES[currentId] = MESSAGES[currentId] || []).push({
      u: "artem", t: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      text: text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])),
    });
    input.value = "";
    renderStream(currentId);
  });

  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (isVoice()) renderStage(findChannel(currentId), roomPeople(findChannel(currentId)));
    }, 160);
  });

  const spot = $("spotlight");
  window.addEventListener("pointermove", (e) => {
    spot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  const typing = $("typing");
  const cycle = () => {
    if (!isVoice()) typing.classList.add("show");
    setTimeout(() => typing.classList.remove("show"), 3200);
    setTimeout(cycle, 9000 + Math.random() * 6000);
  };
  setTimeout(cycle, 2500);
}

applyPref();
renderServers();
renderChannels();
renderMembers();
renderVoiceConsole();
wire();
openChannel("general");
applyPref();
