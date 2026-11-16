let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 5200;
    shelf.gain.value = -2;
    master.connect(shelf).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function wakeAudio() {
  audio();
}

function tone(ac, { f, to = null, t0 = 0, d = 0.18, type = "sine", g = 0.2, attack = 0.008, hold = 0 }) {
  const at = ac.currentTime + t0;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + d * 0.9);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(g, at + attack);
  if (hold) gain.gain.setValueAtTime(g, at + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + d);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + d + 0.03);
}

function air(ac, { t0 = 0, d = 0.12, g = 0.05, freq = 2400 }) {
  const at = ac.currentTime + t0;
  const frames = Math.floor(ac.sampleRate * d);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const k = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * k * k;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq;
  band.Q.value = 0.9;
  const gain = ac.createGain();
  gain.gain.value = g;
  src.connect(band).connect(gain).connect(master);
  src.start(at);
}

const CUES = {
  "call-join": (ac, g) => {
    tone(ac, { f: 523.25, d: 0.12, g: g * 0.7, type: "sine" });
    tone(ac, { f: 783.99, t0: 0.07, d: 0.16, g: g * 0.8, type: "sine" });
    tone(ac, { f: 1046.5, t0: 0.15, d: 0.3, g: g * 0.55, type: "sine" });
  },
  "call-leave": (ac, g) => {
    tone(ac, { f: 880, d: 0.13, g: g * 0.65, type: "sine" });
    tone(ac, { f: 587.33, t0: 0.08, d: 0.2, g: g * 0.6, type: "sine" });
    tone(ac, { f: 440, t0: 0.18, d: 0.26, g: g * 0.5, type: "sine" });
  },
  "user-join": (ac, g) => {
    tone(ac, { f: 640, to: 900, d: 0.11, g: g * 0.5, type: "sine" });
    tone(ac, { f: 1180, t0: 0.08, d: 0.14, g: g * 0.32, type: "sine" });
  },
  "user-leave": (ac, g) => {
    tone(ac, { f: 760, to: 480, d: 0.14, g: g * 0.5, type: "sine" });
  },
  "mute": (ac, g) => {
    tone(ac, { f: 520, to: 340, d: 0.1, g: g * 0.55, type: "triangle" });
  },
  "unmute": (ac, g) => {
    tone(ac, { f: 380, to: 620, d: 0.1, g: g * 0.55, type: "triangle" });
  },
  "deafen": (ac, g) => {
    tone(ac, { f: 460, to: 250, d: 0.16, g: g * 0.55, type: "sine" });
    air(ac, { t0: 0.02, d: 0.1, g: g * 0.08, freq: 1200 });
  },
  "undeafen": (ac, g) => {
    tone(ac, { f: 300, to: 560, d: 0.16, g: g * 0.55, type: "sine" });
  },
  "cam-on": (ac, g) => {
    tone(ac, { f: 900, d: 0.07, g: g * 0.45, type: "triangle" });
    tone(ac, { f: 1350, t0: 0.06, d: 0.13, g: g * 0.34, type: "triangle" });
  },
  "cam-off": (ac, g) => {
    tone(ac, { f: 1100, t0: 0, d: 0.07, g: g * 0.4, type: "triangle" });
    tone(ac, { f: 760, t0: 0.06, d: 0.12, g: g * 0.34, type: "triangle" });
  },
  "screen-on": (ac, g) => {
    tone(ac, { f: 700, to: 1050, d: 0.16, g: g * 0.4, type: "sine" });
  },
  "screen-off": (ac, g) => {
    tone(ac, { f: 1050, to: 700, d: 0.16, g: g * 0.4, type: "sine" });
  },
  "mention": (ac, g) => {
    tone(ac, { f: 784, d: 0.12, g: g * 0.6, type: "sine" });
    tone(ac, { f: 1174.7, t0: 0.09, d: 0.22, g: g * 0.5, type: "sine" });
  },
};

const ALIASES = {
  join: "call-join",
  leave: "call-leave",
  cam: "cam-on",
  screen: "screen-on",
};

export function cue(kind, volume = 60) {
  const v = Math.max(0, Math.min(1, volume / 100));
  if (v === 0) return;
  const key = ALIASES[kind] || kind;
  const build = CUES[key];
  if (!build) return;
  build(audio(), 0.17 * v);
}

const MESSAGES = {
  "Мягкий": { tones: [{ f: 880, d: 0.09 }, { f: 1320, t0: 0.07, d: 0.2 }], type: "sine" },
  "Пинг": { tones: [{ f: 1180, d: 0.12 }, { f: 1760, t0: 0.08, d: 0.24 }], type: "sine" },
  "Капля": { tones: [{ f: 980, to: 380, d: 0.22 }], type: "sine" },
  "Аккорд": {
    tones: [{ f: 523.25, d: 0.32 }, { f: 659.25, t0: 0.04, d: 0.34 }, { f: 783.99, t0: 0.08, d: 0.36 }],
    type: "triangle",
  },
};

export function playSound(name = "Мягкий", volume = 60) {
  const v = Math.max(0, Math.min(1, volume / 100));
  if (v === 0) return;
  const preset = MESSAGES[name] || MESSAGES["Мягкий"];
  const ac = audio();
  for (const item of preset.tones) {
    tone(ac, { ...item, type: preset.type || "sine", g: 0.15 * v });
  }
}
