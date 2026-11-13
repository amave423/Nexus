import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

let wasmBinary = null;
let wasmFailed = false;
let wasmLoading = null;
const loadedContexts = new WeakSet();

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

export async function buildMicTrack(stream, { level = 100, mode = "rnnoise" } = {}) {
  const raw = stream.getAudioTracks()[0];
  const gainValue = Math.max(0, Math.min(1, level / 100));

  if (mode !== "rnnoise" && gainValue >= 1) {
    return { track: raw, failed: false, dispose() {} };
  }

  let binary = null;
  if (mode === "rnnoise") {
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
  let failed = false;

  if (binary) {
    try {
      if (!loadedContexts.has(ctx)) {
        await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
        loadedContexts.add(ctx);
      }
      worklet = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binary });
      source.connect(worklet);
      node = worklet;
    } catch (error) {
      console.warn("[nexus] rnnoise worklet failed", error);
      worklet = null;
      failed = true;
    }
  }

  const gain = ctx.createGain();
  gain.gain.value = gainValue;

  // жёсткий лимитер: без него громкий голос уходил в перегруз и хрипел
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;

  const dest = ctx.createMediaStreamDestination();
  node.connect(gain).connect(limiter).connect(dest);

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
