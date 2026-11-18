import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

const GATE_SOURCE = `
class NexusGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.env = 0;
    this.gain = 0;
    this.hold = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const src = input[0];
    if (!src) return true;
    for (let channel = 0; channel < output.length; channel += 1) {
      const dst = output[channel];
      for (let i = 0; i < dst.length; i += 1) {
        const sample = src[i] || 0;
        const level = Math.abs(sample);
        const coef = level > this.env ? 0.35 : 0.0004;
        this.env += (level - this.env) * coef;
        if (this.env > 0.012) this.hold = 2600;
        else if (this.hold > 0) this.hold -= 1;
        const open = this.hold > 0;
        const speed = open ? 0.08 : 0.0006;
        this.gain += ((open ? 1 : 0) - this.gain) * speed;
        dst[i] = sample * this.gain;
      }
    }
    return true;
  }
}
registerProcessor("nexus-gate", NexusGate);
`;

const AI_MODES = new Set(["rnnoise", "rnnoise_gate"]);
const GATE_MODES = new Set(["rnnoise_gate", "gate"]);

let wasmBinary = null;
let wasmFailed = false;
let wasmLoading = null;
let gateUrl = null;
const loadedContexts = new WeakSet();
const gateContexts = new WeakSet();

async function ensureWasm() {
  if (wasmBinary) return wasmBinary;
  if (wasmFailed) return null;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    try {
      wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseWasmSimdUrl });
      return wasmBinary;
    } catch (error) {
      wasmFailed = true;
      console.warn("[nexus] rnnoise wasm failed", error);
      return null;
    } finally {
      wasmLoading = null;
    }
  })();
  return wasmLoading;
}

export async function rnnoiseReady() {
  return !!(await ensureWasm());
}

export function rnnoiseError() {
  return wasmFailed;
}

function gateWorkletUrl() {
  if (!gateUrl) gateUrl = URL.createObjectURL(new Blob([GATE_SOURCE], { type: "application/javascript" }));
  return gateUrl;
}

export async function buildMicTrack(stream, { level = 100, mode = "rnnoise" } = {}) {
  const raw = stream.getAudioTracks()[0];
  const gainValue = Math.max(0, Math.min(2, Number(level) / 100));
  const wantAi = AI_MODES.has(mode);
  const wantGate = GATE_MODES.has(mode);

  if (!wantAi && !wantGate && gainValue === 1) {
    return { track: raw, failed: false, dispose() {} };
  }

  let binary = null;
  if (wantAi) {
    binary = await ensureWasm();
    if (!binary) {
      return { track: raw, failed: true, dispose() {} };
    }
  }

  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  try {
    await ctx.resume();
  } catch {
    /* браузер разбудит контекст при первом звуке */
  }

  const source = ctx.createMediaStreamSource(stream);
  let node = source;
  let worklet = null;
  let gate = null;
  let failed = false;

  if (binary) {
    try {
      if (!loadedContexts.has(ctx)) {
        await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
        loadedContexts.add(ctx);
      }
      worklet = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binary });
      node.connect(worklet);
      node = worklet;
    } catch (error) {
      console.warn("[nexus] rnnoise worklet failed", error);
      worklet = null;
      failed = true;
    }
  }

  // срезаем гул стола, вентилятор и низкий фон — уже одного этого хватает половине микрофонов
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 85;
  highpass.Q.value = 0.7;
  node.connect(highpass);
  node = highpass;

  // усиление стоит до гейта: тихий микрофон поднимается, и гейт пропускает такой голос
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  node.connect(gain);
  node = gain;

  if (wantGate) {
    try {
      if (!gateContexts.has(ctx)) {
        await ctx.audioWorklet.addModule(gateWorkletUrl());
        gateContexts.add(ctx);
      }
      gate = new AudioWorkletNode(ctx, "nexus-gate", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      node.connect(gate);
      node = gate;
    } catch (error) {
      console.warn("[nexus] gate worklet failed", error);
      gate = null;
      failed = true;
    }
  }

  // жёсткий лимитер: без него громкий голос (и усиление до 200%) уходил в перегруз
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;

  const dest = ctx.createMediaStreamDestination();
  node.connect(limiter).connect(dest);

  return {
    track: dest.stream.getAudioTracks()[0],
    failed,
    ctx,
    dispose() {
      try {
        worklet?.destroy?.();
      } catch {
        /* уже закрыт */
      }
      try {
        gate?.disconnect();
        highpass.disconnect();
        source.disconnect();
        gain.disconnect();
        limiter.disconnect();
      } catch {
        /* уже отключено */
      }
      ctx.close().catch(() => {});
    },
  };
}
