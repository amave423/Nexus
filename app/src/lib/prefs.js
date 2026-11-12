import { writable, get } from "svelte/store";

const KEY = "nexus.pref.v1";

export const THEMES = { "Чернила": "ink", "Полночь": "night", "Контраст": "contrast" };
export const DENSITY = { "Просторно": "wide", "Обычно": "normal", "Плотно": "compact" };
export const SOUNDS = { "Мягкий": "soft", "Пинг": "ping", "Капля": "drop", "Аккорд": "chord" };
export const ACCENTS = [
  ["#c8ff3d", "кислота"],
  ["#6fe3ff", "лёд"],
  ["#ff6b8a", "роза"],
  ["#b18cff", "фиалка"],
  ["#ffb454", "янтарь"],
];

export const DEFAULTS = {
  theme: "Чернила",
  density: "Обычно",
  accent: "#c8ff3d",
  anim: true,
  bg: true,
  sound: "Мягкий",
  volume: 60,
  notifSound: true,
  notifDesktop: false,
  notifMention: true,
  dnd: false,
  micDev: "По умолчанию",
  outDev: "По умолчанию",
  micDevId: "",
  outDevId: "",
  micLevel: 100,
  noiseSup: true,
  echoCancel: true,
  autoGain: true,
  voiceMode: false,
  quality: "96 kbps",
  keys: {
    mic: "Ctrl+M",
    deaf: "Ctrl+D",
    cam: "Ctrl+E",
    screen: "Ctrl+S",
    leave: "Ctrl+Shift+D",
    search: "Ctrl+K",
  },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...raw, keys: { ...DEFAULTS.keys, ...(raw.keys || {}) } };
  } catch {
    return { ...DEFAULTS, keys: { ...DEFAULTS.keys } };
  }
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

export function applyPref(pref) {
  const root = document.documentElement;
  root.dataset.theme = THEMES[pref.theme] || "ink";
  root.dataset.density = DENSITY[pref.density] || "normal";
  root.style.setProperty("--acid", pref.accent);
  root.style.setProperty("--acid-rgb", hexToRgb(pref.accent));
  document.body.classList.toggle("no-anim", !pref.anim);
  document.body.classList.toggle("no-bg", !pref.bg);
}

function createPrefs() {
  const store = writable(load());
  store.subscribe((value) => {
    applyPref(value);
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* переполнение хранилища не должно ломать интерфейс */
    }
  });
  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
    patch(part) {
      store.update((p) => ({ ...p, ...part }));
    },
    setKey(action, combo) {
      store.update((p) => ({ ...p, keys: { ...p.keys, [action]: combo } }));
    },
    resetKeys() {
      store.update((p) => ({ ...p, keys: { ...DEFAULTS.keys } }));
    },
    get: () => get(store),
  };
}

export const prefs = createPrefs();
