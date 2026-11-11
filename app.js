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
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  send: S('<path d="M4.5 12 20 4l-6.5 16-2.5-6.5L4.5 12z"/>'),
  smile: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  clip: S('<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>'),
  reply: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v3"/>'),
  react: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  more: S('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  phoneOff: S('<path d="M3 3l18 18"/><path d="M6.5 3.5 9 6l-1.5 3.5a12 12 0 0 0 6 6L17 14l2.5 2.5-1.5 3a2 2 0 0 1-2 1A16 16 0 0 1 3.5 6a2 2 0 0 1 1-2l2-.5z"/>'),
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
    {
      u: "mira", t: "14:02",
      text: "Поднял новый сервер. <b>Одно ядро, гигабайт памяти</b> — и всё это должно летать.",
      react: [["🔥", 4, true], ["🫡", 2, false]],
    },
    {
      u: "kostya", t: "14:04",
      reply: ["Мира", "Поднял новый сервер. Одно ядро, гигабайт памяти…"],
      text: "Голос на WebRTC, шумодав на клиенте. Сервер только сигналит — звук идёт напрямую между людьми.",
    },
    {
      u: "dasha", t: "14:07",
      text: "Тогда и дизайн не должен быть как у всех. Никаких левых панелей, никаких серых списков.",
      attach: { name: "layout-v3.png", size: "1.4 МБ · 2560×1440" },
    },
    {
      u: "artem", t: "14:09",
      text: "Согласен. Каналы — внизу, как пульт. Участники — справа, по требованию. Всё остальное — воздух.",
      react: [["💚", 3, true]],
    },
    { u: "lev", t: "14:11", text: "а где настройки" },
    {
      u: "kostya", t: "14:11",
      text: "в правом верхнем, как у людей",
      react: [["😄", 3, false]],
    },
  ],
  design: [
    { div: "сегодня" },
    {
      u: "dasha", t: "13:40",
      text: "Палитра: <code>#c8ff3d</code> как единственный акцент. Всё остальное — оттенки чернил.",
      react: [["🎨", 2, false]],
    },
    {
      u: "artem", t: "13:44",
      text: "Кислотный на чёрном — хорошо. Но не заливать им всё, только активное состояние.",
    },
    {
      u: "mira", t: "13:51",
      text: "Шрифты: Space Grotesk для интерфейса, JetBrains Mono для метаданных. Время, статусы, счётчики — только моно.",
    },
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
    group: "в сети", items: [
      { u: "artem", status: "#c8ff3d", act: "в голосовом · Кухня", live: true },
      { u: "mira", status: "#c8ff3d", act: "печатает…", live: true },
      { u: "kostya", status: "#c8ff3d", act: "в голосовом · Кухня", live: true },
      { u: "dasha", status: "#ffb454", act: "отошла · 12 мин" },
      { u: "lev", status: "#ff6b8a", act: "не беспокоить" },
    ],
  },
  {
    group: "не в сети", items: [
      { u: "artem", status: "#3a3a44", act: "был(а) 2 ч назад", off: true, alt: "Тимур" },
      { u: "dasha", status: "#3a3a44", act: "был(а) вчера", off: true, alt: "Ника" },
    ],
  },
];

const $ = (id) => document.getElementById(id);
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const initial = (n) => n.trim().charAt(0).toUpperCase();

function avatarHTML(user, cls = "") {
  const u = USERS[user];
  return `<span class="avatar ${cls}" style="background:linear-gradient(150deg,${u.color},${shade(u.color)})">${initial(u.name)}</span>`;
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 70), g = Math.max(0, ((n >> 8) & 255) - 70), b = Math.max(0, (n & 255) - 70);
  return `rgb(${r},${g},${b})`;
}

/* ---------- render ---------- */
function renderServers() {
  $("servers").innerHTML = SERVERS.map(
    (s) => `<button class="coin ${s.active ? "active" : ""} ${s.add ? "add" : ""}" data-id="${s.id}">${s.label}</button>`
  ).join("");
  $("servers").querySelectorAll(".coin").forEach((c) => {
    c.addEventListener("click", () => {
      if (c.classList.contains("add")) return;
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
        const minis = c.live.map((u) => `<span class="mini-av" style="background:${USERS[u].color}">${initial(USERS[u].name)}</span>`).join("");
        return `<button class="chan voice" data-id="${c.id}">
          ${ICONS.volume}<span class="nm">${c.name}</span>
          ${c.live.length ? `<span class="mini">${minis}</span>` : `<span class="live-dot" style="background:#3a3a44;box-shadow:none;animation:none"></span>`}
        </button>`;
      }
      return `<button class="chan" data-id="${c.id}">${ICONS.hash}<span class="nm">${c.name}</span></button>`;
    }).join("");
    return `<span class="chan-group">${g.group}</span>${items}`;
  }).join("");

  rail.querySelectorAll(".chan").forEach((b) => b.addEventListener("click", () => openChannel(b.dataset.id)));
}

function findChannel(id) {
  for (const g of CHANNELS) for (const c of g.items) if (c.id === id) return c;
  return null;
}

function openChannel(id) {
  const ch = findChannel(id);
  if (!ch) return;
  $("chanRail").querySelectorAll(".chan").forEach((b) => b.classList.toggle("active", b.dataset.id === id));
  $("chanName").textContent = ch.name;
  $("chanTopic").textContent = ch.topic || (ch.type === "voice" ? "голосовой канал" : "");
  $("chanGlyph").innerHTML = ch.type === "voice" ? ICONS.volume : ICONS.hash;
  document.body.classList.remove("nav-open");
  $("input").placeholder = ch.type === "voice" ? `Написать в ${ch.name}` : `Написать в #${ch.name}`;
  renderStream(id);
}

function renderStream(id) {
  const list = MESSAGES[id] || [{ div: "сегодня" }, { u: "mira", t: "—", text: "Тут пока тихо." }];
  const stream = $("stream");
  stream.innerHTML = `<div class="stream-inner">` + list.map((m) => {
    if (m.div) return `<div class="divider"><div class="g"></div><div class="l"><span>${m.div}</span></div></div>`;
    const u = USERS[m.u];
    const reply = m.reply
      ? `<div class="reply"><b>${m.reply[0]}</b><span>${m.reply[1]}</span></div>` : "";
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
          <span class="name">${u.name}</span>
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

function renderMembers() {
  const total = MEMBERS.reduce((a, g) => a + g.items.length, 0);
  $("members").innerHTML = `
    <div class="mem-head"><span>участники</span><span class="count">${total}</span></div>
    ${MEMBERS.map((g) => `
      <div class="mem-group">
        <h3>${g.group} — ${g.items.length}</h3>
        ${g.items.map((m) => {
          const u = USERS[m.u];
          const name = m.alt || u.name;
          return `<div class="mem ${m.off ? "off" : ""}">
            <span class="avatar" style="background:linear-gradient(150deg,${m.off ? "#3a3a44,#26262e" : u.color + "," + shade(u.color)})">
              ${initial(name)}
              <span class="status" style="background:${m.status}"></span>
            </span>
            <div class="mem-info">
              <div class="mem-name">${name}</div>
              <div class="mem-act ${m.live ? "live" : ""}">${m.act}</div>
            </div>
          </div>`;
        }).join("")}
      </div>`).join("")}`;
}

function renderVoice() {
  $("voiceSeg").innerHTML = `
    <div class="voice-top">
      <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="voice-info">
        <span class="lbl">в голосовом</span>
        <span class="nm">Кухня · 3</span>
      </div>
    </div>
    <div class="voice-btns">
      <button class="vbtn" id="micBtn" title="Микрофон">${ICONS.mic}</button>
      <button class="vbtn" id="deafBtn" title="Звук">${ICONS.headphones}</button>
      <button class="vbtn" id="camBtn" title="Камера">${ICONS.camera}</button>
      <button class="vbtn" id="scrBtn" title="Экран">${ICONS.screen}</button>
      <button class="vbtn leave" title="Отключиться">${ICONS.phoneOff}</button>
    </div>`;
}

/* ---------- interactions ---------- */
function wire() {
  $("searchBtn").innerHTML = ICONS.search;
  $("menuBtn").innerHTML = ICONS.menu;
  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  $("membersBtn").innerHTML = ICONS.users;
  $("attachBtn").innerHTML = ICONS.clip;
  $("emojiBtn").innerHTML = ICONS.smile;
  document.querySelector(".send-btn").innerHTML = ICONS.send;

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
    const id = $("chanRail").querySelector(".chan.active")?.dataset.id || "general";
    (MESSAGES[id] = MESSAGES[id] || []).push({
      u: "artem", t: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      text: text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])),
    });
    input.value = "";
    renderStream(id);
  });

  $("micBtn").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.classList.toggle("off");
    b.innerHTML = b.classList.contains("off") ? ICONS.micOff : ICONS.mic;
    $("voiceSeg").classList.toggle("muted", b.classList.contains("off"));
  });
  $("deafBtn").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.classList.toggle("off");
    b.innerHTML = b.classList.contains("off") ? ICONS.headphonesOff : ICONS.headphones;
  });
  $("camBtn").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.classList.toggle("off");
    $("pip").hidden = !b.classList.contains("off");
  });

  const spot = $("spotlight");
  window.addEventListener("pointermove", (e) => {
    spot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  const typing = $("typing");
  const cycle = () => {
    typing.classList.add("show");
    setTimeout(() => typing.classList.remove("show"), 3200);
    setTimeout(cycle, 9000 + Math.random() * 6000);
  };
  setTimeout(cycle, 2500);
}

renderServers();
renderChannels();
renderMembers();
renderVoice();
wire();
openChannel("general");
