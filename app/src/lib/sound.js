let ctx = null;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function blip(ac, { f, t0 = 0, d = 0.2, type = "sine", g = 0.2, to = null }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, ac.currentTime + t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, ac.currentTime + t0 + d);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + t0);
  gain.gain.exponentialRampToValueAtTime(g, ac.currentTime + t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + d);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + t0);
  osc.stop(ac.currentTime + t0 + d + 0.02);
}

export function cue(kind, volume = 60) {
  const v = Math.max(0, Math.min(1, volume / 100));
  if (v === 0) return;
  const ac = audio();
  const g = 0.11 * v;
  switch (kind) {
    case "join":
      blip(ac, { f: 640, d: 0.11, type: "sine", g });
      blip(ac, { f: 960, t0: 0.09, d: 0.18, type: "sine", g: g * 0.8 });
      break;
    case "leave":
      blip(ac, { f: 820, d: 0.1, type: "sine", g });
      blip(ac, { f: 520, t0: 0.09, d: 0.2, type: "sine", g: g * 0.8 });
      break;
    case "cam":
      blip(ac, { f: 1180, d: 0.08, type: "triangle", g: g * 0.8 });
      blip(ac, { f: 1580, t0: 0.07, d: 0.12, type: "triangle", g: g * 0.55 });
      break;
    case "screen":
      blip(ac, { f: 700, d: 0.09, type: "triangle", g: g * 0.8 });
      blip(ac, { f: 1050, t0: 0.08, d: 0.14, type: "triangle", g: g * 0.55 });
      break;
    case "mute":
      blip(ac, { f: 430, to: 250, d: 0.14, type: "sine", g });
      break;
    case "unmute":
      blip(ac, { f: 300, to: 520, d: 0.14, type: "sine", g });
      break;
    case "deafen":
      blip(ac, { f: 370, to: 210, d: 0.18, type: "sine", g });
      break;
    case "undeafen":
      blip(ac, { f: 250, to: 480, d: 0.18, type: "sine", g });
      break;
    default:
      return;
  }
}

export function playSound(name = "Мягкий", volume = 60) {
  const v = Math.max(0, Math.min(1, volume / 100));
  if (v === 0) return;
  const ac = audio();
  const g = 0.16 * v;
  switch (name) {
    case "Пинг":
      blip(ac, { f: 1180, d: 0.16, type: "sine", g });
      blip(ac, { f: 1760, t0: 0.09, d: 0.2, type: "sine", g: g * 0.7 });
      break;
    case "Капля":
      blip(ac, { f: 900, to: 320, d: 0.22, type: "sine", g });
      break;
    case "Аккорд":
      blip(ac, { f: 523, d: 0.34, type: "triangle", g: g * 0.8 });
      blip(ac, { f: 659, t0: 0.05, d: 0.34, type: "triangle", g: g * 0.7 });
      blip(ac, { f: 784, t0: 0.1, d: 0.4, type: "triangle", g: g * 0.6 });
      break;
    default:
      blip(ac, { f: 660, d: 0.18, type: "sine", g });
      blip(ac, { f: 990, t0: 0.07, d: 0.22, type: "sine", g: g * 0.6 });
  }
}
