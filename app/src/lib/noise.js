import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

let wasmBinary = null;
let wasmFailed = false;
const loadedContexts = new WeakSet();

async function ensureWasm() {
  if (wasmBinary) return wasmBinary;
  if (wasmFailed) return null;
  try {
    wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseWasmSimdUrl });
    return wasmBinary;
  } catch {
    wasmFailed = true;
    return null;
  }
}

export async function rnnoiseReady() {
  return !!(await ensureWasm());
}

export async function buildMicTrack(stream, { level = 100, mode = "rnnoise" } = {}) {
  const raw = stream.getAudioTracks()[0];
  if (mode === "off" && (!level || level >= 100)) return { track: raw, dispose() {} };

  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  try {
    await ctx.resume();
  } catch {
    /* браузер сам разбудит */
  }

  const source = ctx.createMediaStreamSource(stream);
  let node = source;
  let worklet = null;

  if (mode === "rnnoise") {
    const binary = await ensureWasm();
    if (binary) {
      try {
        if (!loadedContexts.has(ctx)) {
          await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
          loadedContexts.add(ctx);
        }
        worklet = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binary });
        source.connect(worklet);
        node = worklet;
      } catch {
        worklet = null;
      }
    }
  }

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, level / 100));
  const dest = ctx.createMediaStreamDestination();
  node.connect(gain).connect(dest);

  return {
    track: dest.stream.getAudioTracks()[0],
    ctx,
    dispose() {
      try {
        worklet?.destroy?.();
      } catch {
        /* уже закрыт */
      }
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* уже отключено */
      }
      ctx.close().catch(() => {});
    },
  };
}
