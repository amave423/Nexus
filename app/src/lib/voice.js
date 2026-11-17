import { writable } from "svelte/store";
import { Device } from "mediasoup-client";
import { buildMicTrack } from "./noise.js";
import { cue } from "./sound.js";
import { prefs } from "./prefs.js";

function soundCue(kind) {
  const pref = prefs.get();
  if (!pref.voiceSounds) return;
  cue(kind, pref.volume);
}

const emptyRemote = () => ({ audio: null, screenAudio: null, camera: null, screen: null });

export function createVoiceClient({ send, settings = () => ({}) }) {
  let seq = 0;
  const pending = new Map();

  let device = null;
  let sendTransport = null;
  let recvTransport = null;
  let sendReady = null;
  let recvReady = null;

  let micStream = null;
  let micProducer = null;
  let camStream = null;
  let camProducer = null;
  let screenStream = null;
  let screenProducer = null;
  let screenAudioProducer = null;
  let meter = null;
  let meterTimer = null;
  let micGain = null;
  let audioCtx = null;
  let leaving = false;

  const consumers = new Map();
  const remote = new Map();
  const local = emptyRemote();
  const rosters = new Map();
  const levels = new Map();
  const sinks = new Map();
  const nodes = new Map();
  const volumes = new Map();
  const silent = new Set();
  let mixCtx = null;
  let mixBus = null;
  let levelsPublish = 0;
  let testHold = false;
  let heldEnabled = [];

  const state = {
    channelId: null,
    channelName: null,
    joining: false,
    joined: false,
    error: null,
    muted: false,
    deafened: false,
    cam: false,
    stream: false,
    micLevel: 0,
    micError: null,
    noise: null,
  };

  const store = writable(snapshot());

  function snapshot() {
    return {
      channelId: state.channelId,
      channelName: state.channelName,
      joining: state.joining,
      joined: state.joined,
      error: state.error,
      muted: state.muted,
      deafened: state.deafened,
      cam: state.cam,
      stream: state.stream,
      micLevel: state.micLevel,
      micError: state.micError,
      noise: state.noise,
      rosters,
      remote,
      local,
      levels,
      volumes,
      silent,
    };
  }

  function publish() {
    store.set(snapshot());
  }

  function request(type, data = {}) {
    const req = `${type}:${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(req);
        reject(new Error(`timeout:${type}`));
      }, 20000);
      pending.set(req, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      send({ t: type, req, ...data });
    });
  }

  function pushState() {
    send({
      t: "voice.state",
      muted: state.muted,
      deafened: state.deafened,
      cam: state.cam,
      stream: state.stream,
    });
    publish();
  }

  const audioKey = (userId, source) => `${userId}:${source === "screen" ? "screen" : "mic"}`;
  const audioKeysOf = (userId) =>
    [...new Set([...sinks.keys(), ...nodes.keys()])].filter((key) => key === audioKey(userId, "mic") || key === audioKey(userId, "screen"));

  function applyKeyAudio(key) {
    const userId = Number(String(key).split(":")[0]);
    const level = volumes.has(userId) ? volumes.get(userId) : 1;
    const muted = state.deafened || testHold || silent.has(userId);
    const el = sinks.get(key);
    const node = nodes.get(key);
    if (el) {
      el.muted = muted;
      el.volume = node ? 1 : Math.max(0, Math.min(1, level));
    }
    if (node) node.gain.gain.value = muted ? 0 : level;
  }

  function applyUserAudio(userId) {
    for (const key of audioKeysOf(userId)) applyKeyAudio(key);
  }

  function audioDebug() {
    const ids = new Set([...nodes.keys(), ...sinks.keys()]);
    return [...ids].map((key) => {
      const el = sinks.get(key);
      return {
        key,
        userId: Number(String(key).split(":")[0]),
        gain: nodes.get(key) ? nodes.get(key).gain.gain.value : null,
        volume: el ? el.volume : null,
        muted: el ? el.muted : null,
        live: el && el.srcObject ? el.srcObject.getAudioTracks().every((track) => track.readyState === "live") : null,
        context: mixCtx ? mixCtx.state : "none",
        volumeSet: volumes.has(Number(String(key).split(":")[0])) ? volumes.get(Number(String(key).split(":")[0])) : 1,
        silent: silent.has(Number(String(key).split(":")[0])) || state.deafened,
      };
    });
  }

  function setUserVolume(userId, value) {
    const level = Math.max(0, Math.min(2, Number(value)));
    volumes.set(userId, level);
    applyUserAudio(userId);
    publish();
  }

  function mix() {
    if (mixCtx) return mixCtx;
    try {
      mixCtx = new AudioContext({ latencyHint: "interactive" });
      mixBus = mixCtx.createGain();
      mixBus.connect(mixCtx.destination);
      mixCtx.addEventListener("statechange", () => {
        if (mixCtx && mixCtx.state === "running") routeAll();
      });
      applyOutput(settings());
      resumeMix();
    } catch {
      mixCtx = null;
      mixBus = null;
    }
    return mixCtx;
  }

  function resumeMix() {
    if (mixCtx && mixCtx.state === "suspended") mixCtx.resume().catch(() => {});
  }

  function routeElement(key, el) {
    if (nodes.has(key) || !el) return false;
    const ctx = mix();
    if (!ctx || !mixBus || ctx.state !== "running") return false;
    const userId = Number(String(key).split(":")[0]);
    try {
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = volumes.has(userId) ? volumes.get(userId) : 1;
      source.connect(gain);
      gain.connect(mixBus);
      nodes.set(key, { source, gain, el, stream: el.srcObject });
      return true;
    } catch {
      return false;
    }
  }

  function routeAll() {
    for (const [key, el] of sinks) {
      if (!nodes.has(key)) routeElement(key, el);
      applyKeyAudio(key);
    }
  }

  document.addEventListener("pointerdown", resumeMix, { passive: true });
  document.addEventListener("keydown", resumeMix);

  function setUserMuted(userId, muted) {
    if (muted) silent.add(userId);
    else silent.delete(userId);
    applyUserAudio(userId);
    publish();
  }

  function sinkFor(userId, source = "mic") {
    const key = audioKey(userId, source);
    let el = sinks.get(key);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.dataset.voice = String(userId);
      el.dataset.source = source === "screen" ? "screen" : "mic";
      document.body.appendChild(el);
      sinks.set(key, el);
      if (el.setSinkId) el.setSinkId(settings()?.outDevId || "").catch(() => {});
    }
    return el;
  }

  function applyOutput(pref = settings() || {}) {
    const target = pref.outDevId || "";
    if (mixCtx && mixCtx.setSinkId) mixCtx.setSinkId(target).catch(() => {});
    for (const el of sinks.values()) {
      if (!el.setSinkId) continue;
      if ((el.sinkId || "") === target) continue;
      el.setSinkId(target).catch(() => {});
    }
  }

  function audioSignature(pref) {
    return [
      pref.micDevId || "",
      pref.echoCancel === false ? 0 : 1,
      pref.noiseMode || "rnnoise",
      pref.autoGain ? 1 : 0,
      Number(pref.micLevel) || 0,
      pref.quality || "96 kbps",
    ].join("|");
  }

  let micSignature = "";
  let applyTimer = null;

  function applySettings(pref = settings() || {}) {
    applyOutput(pref);
    if (!state.joined || leaving) return;
    if (state.stream && screenProducer && screenSignature(pref) !== screenSig) {
      clearTimeout(screenTimer);
      screenTimer = setTimeout(() => reencodeScreen().catch(() => {}), 400);
    }
    if (audioSignature(pref) === micSignature) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      restartMic().catch(() => {});
    }, 350);
  }

  let micBusy = false;
  let micPending = false;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function produceOptions() {
    const pref = settings() || {};
    return {
      appData: { source: "camera" },
      encodings: [{ maxBitrate: QUALITY[pref.quality] || 96000 }],
      codecOptions: {
        opusStereo: false,
        opusDtx: false,
        opusFec: true,
        opusMaxPlaybackRate: 48000,
      },
    };
  }

  async function captureMic() {
    const pref = settings() || {};
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: pref.micDevId ? { exact: pref.micDevId } : undefined,
        echoCancellation: pref.echoCancel !== false,
        noiseSuppression: pref.noiseMode === "browser",
        autoGainControl: !!pref.autoGain,
        channelCount: 1,
      },
      video: false,
    });
    let track = stream.getAudioTracks()[0];
    let chain = null;
    try {
      chain = await buildMicTrack(stream, {
        level: pref.micLevel,
        mode: pref.noiseMode || "rnnoise",
      });
      track = chain.track;
      state.noise = chain.failed ? "failed" : pref.noiseMode || "rnnoise";
    } catch {
      chain = null;
      state.noise = "failed";
    }
    state.noise = state.noise || pref.noiseMode || "rnnoise";
    return { stream, chain, track };
  }

  async function restartMic() {
    if (!state.joined || leaving) return;
    if (micBusy) {
      micPending = true;
      return;
    }
    clearTimeout(applyTimer);
    micBusy = true;
    try {
      const prevStream = micStream;
      const prevChain = micChain;
      let next;
      try {
        next = await captureMic();
      } catch {
        state.micError = "no_mic";
        return;
      }
      const track = next.track;
      if (micProducer) {
        try {
          await micProducer.replaceTrack({ track });
        } catch {
          try {
            micProducer.close();
          } catch {
            /* уже закрыт */
          }
          micProducer = null;
        }
      }
      if (!micProducer) {
        try {
          micProducer = await sendTransport.produce({ track, ...produceOptions() });
        } catch {
          next.stream.getTracks().forEach((item) => item.stop());
          next.chain?.dispose?.();
          state.micError = "no_mic";
          return;
        }
      }
      micStream = next.stream;
      micChain = next.chain;
      micSignature = audioSignature(settings() || {});
      state.micError = null;
      local.mic = micStream;
      prevStream?.getTracks().forEach((item) => item.stop());
      prevChain?.dispose?.();
      startMeter(track);
      silenceTracks(state.muted);
      await request("voice.pauseProducer", {
        producerId: micProducer.id,
        paused: state.muted,
      }).catch(() => {});
    } finally {
      micBusy = false;
      publish();
      if (micPending) {
        micPending = false;
        setTimeout(() => restartMic().catch(() => {}), 120);
      }
    }
  }

  function attachAudio(userId, stream, source = "mic") {
    const key = audioKey(userId, source);
    const el = sinkFor(userId, source);
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
      const node = nodes.get(key);
      if (node) node.stream = stream;
    }
    if (!nodes.has(key)) routeElement(key, el);
    resumeMix();
    applyKeyAudio(key);
  }

  function dropKey(key) {
    const node = nodes.get(key);
    nodes.delete(key);
    if (node) {
      try {
        node.source.disconnect();
        node.gain.disconnect();
      } catch {
        /* уже отключено */
      }
    }
    const el = sinks.get(key);
    if (!el) return;
    el.srcObject = null;
    el.remove();
    sinks.delete(key);
  }

  function dropSink(userId) {
    dropKey(audioKey(userId, "mic"));
    dropKey(audioKey(userId, "screen"));
  }

  function dropUser(userId) {
    remote.delete(userId);
    dropSink(userId);
    for (const [producerId, entry] of [...consumers]) {
      if (entry.userId === userId) {
        entry.consumer.close();
        consumers.delete(producerId);
      }
    }
  }

  function setStream(userId, kind, source, stream) {
    const entry = remote.get(userId) || emptyRemote();
    if (kind === "audio") {
      if (source === "screen") entry.screenAudio = stream;
      else entry.audio = stream;
      attachAudio(userId, stream, source);
    } else if (source === "screen") entry.screen = stream;
    else entry.camera = stream;
    remote.set(userId, entry);
    publish();
  }

  function clearStream(userId, kind, source) {
    const entry = remote.get(userId);
    if (!entry) return;
    if (kind === "audio") {
      if (source === "screen") {
        entry.screenAudio = null;
        dropKey(audioKey(userId, "screen"));
      } else {
        entry.audio = null;
        dropKey(audioKey(userId, "mic"));
      }
    } else if (source === "screen") entry.screen = null;
    else entry.camera = null;
    publish();
  }

  async function connectTransport(transport, dtlsParameters) {
    await request("voice.connectTransport", { transportId: transport.id, dtlsParameters });
  }

  async function makeTransports(rtpCapabilities) {
    device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });

    const recvOptions = await request("voice.createTransport", { direction: "recv" });
    recvTransport = device.createRecvTransport(recvOptions);
    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      connectTransport(recvTransport, dtlsParameters).then(callback, errback);
    });
    recvReady = Promise.resolve();

    const sendOptions = await request("voice.createTransport", { direction: "send" });
    sendTransport = device.createSendTransport(sendOptions);
    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      connectTransport(sendTransport, dtlsParameters).then(callback, errback);
    });
    sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      request("voice.produce", {
        transportId: sendTransport.id,
        kind,
        rtpParameters,
        source: appData?.source || "camera",
      }).then((reply) => callback({ id: reply.id }), errback);
    });
    sendTransport.on("connectionstatechange", (value) => {
      if (value === "failed") state.error = "media_lost";
    });
    sendReady = Promise.resolve();
  }

  const pendingProducers = [];

  async function consume({ producerId, userId, kind, source }) {
    if (consumers.has(producerId)) return;
    if (!recvTransport) return;
    const reply = await request("voice.consume", {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    });
    const consumer = await recvTransport.consume({
      id: reply.id,
      producerId,
      kind: reply.kind,
      rtpParameters: reply.rtpParameters,
      appData: reply.appData || {},
    });
    consumers.set(producerId, {
      consumer,
      userId: reply.userId || userId,
      kind: reply.kind,
      source: reply.source || source,
    });
    const stream = new MediaStream([consumer.track]);
    setStream(reply.userId || userId, reply.kind, reply.source || source, stream);
    try {
      await request("voice.resumeConsumer", { consumerId: consumer.id });
    } catch {
      /* consumer may already be closed */
    }
  }

  function startMeter(track) {
    stopMeter();
    try {
      audioCtx = audioCtx || new AudioContext();
      const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      meter = analyser;
      meterTimer = setInterval(() => {
        if (!meter) return;
        meter.getByteFrequencyData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value;
        const next = Math.min(1, sum / buffer.length / 90);
        if (Math.abs(next - state.micLevel) < 0.06) return;
        state.micLevel = next;
        publish();
      }, 180);
    } catch {
      /* метра не будет, голос работает */
    }
  }

  function stopMeter() {
    clearInterval(meterTimer);
    meterTimer = null;
    meter = null;
    state.micLevel = 0;
  }

  const QUALITY = { "64 kbps": 64000, "96 kbps": 96000, "128 kbps": 128000 };
  let micChain = null;

  function micTrack() {
    const chained = micChain?.track || null;
    if (chained && chained.readyState === "live") return chained;
    const producer = micProducer?.track || null;
    if (producer && producer.readyState === "live") return producer;
    const raw = micStream?.getAudioTracks()[0] || null;
    if (raw && raw.readyState === "live") return raw;
    return null;
  }

  async function requestMic() {
    if (!state.joined || leaving) {
      pushState();
      return false;
    }
    clearTimeout(applyTimer);
    await restartMic();
    const ok = !!micProducer;
    if (ok) {
      state.micError = null;
      if (state.deafened) await setDeafened(false, true);
      if (state.muted) await setMuted(false);
      else pushState();
    } else {
      state.micError = "no_mic";
      pushState();
    }
    return ok;
  }

  async function stopMic() {
    stopMeter();
    if (micProducer) {
      const producer = micProducer;
      micProducer = null;
      try {
        await request("voice.closeProducer", { producerId: producer.id });
      } catch {
        /* уже закрыт */
      }
      try {
        producer.close();
      } catch {
        /* уже закрыт */
      }
    }
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    micChain?.dispose();
    micChain = null;
    local.mic = null;
    publish();
  }

  async function join(channelId, channelName = "") {
    if (state.channelId === channelId && state.joined) return;
    if (state.channelId) await leave();
    leaving = false;
    Object.assign(state, { channelId, channelName, joining: true, joined: false, error: null });
    publish();
    try {
      const joined = await request("voice.join", { channelId });
      state.channelName = joined.channelName || channelName || state.channelName;
      await makeTransports(joined.rtpCapabilities);
      await sendReady;
      await recvReady;
      for (const peer of joined.peers || []) {
        for (const producer of peer.producers || []) {
          consume({ producerId: producer.producerId, userId: peer.userId, kind: producer.kind, source: producer.source }).catch(
            () => {}
          );
        }
      }
      state.joined = true;
      state.joining = false;
      micSignature = "";
      await restartMic();
      pushState();
      const pref = settings() || {};
      applyOutput(pref);
      resumeMix();
      micSignature = audioSignature(pref);
      for (const queued of pendingProducers.splice(0)) {
        consume({
          producerId: queued.producerId,
          userId: queued.userId,
          kind: queued.kind,
          source: queued.source,
        }).catch(() => {});
      }
    } catch (error) {
      state.error = error.message;
      state.joining = false;
      await cleanup();
      publish();
      throw error;
    }
  }

  async function cleanup() {
    for (const entry of consumers.values()) {
      try {
        entry.consumer.close();
      } catch {
        /* already closed */
      }
    }
    consumers.clear();
    remote.clear();
    levels.clear();
    for (const key of new Set([...nodes.keys(), ...sinks.keys()])) dropKey(key);
    pendingProducers.length = 0;
    await stopMic();
    stopCamera({ silent: true });
    stopScreen({ silent: true });
    try {
      sendTransport?.close();
      recvTransport?.close();
    } catch {
      /* already closed */
    }
    sendTransport = null;
    recvTransport = null;
    device = null;
    state.joined = false;
    state.channelId = null;
    state.channelName = null;
    state.micError = null;
    micSignature = "";
    state.cam = false;
    state.stream = false;
    publish();
  }

  async function leave() {
    if (leaving) return;
    leaving = true;
    if (state.channelId) await request("voice.leave").catch(() => {});
    await cleanup();
    leaving = false;
  }

  function silenceTracks(muted) {
    const tracks = [
      ...(micStream?.getAudioTracks() || []),
      ...(micChain?.track ? [micChain.track] : []),
      ...(micProducer?.track ? [micProducer.track] : []),
    ];
    for (const track of tracks) track.enabled = !muted;
  }

  async function setMuted(muted, silent = false) {
    const changed = state.muted !== muted;
    state.muted = muted;
    silenceTracks(muted);
    if (micProducer) {
      await request("voice.pauseProducer", { producerId: micProducer.id, paused: muted }).catch(
        () => {}
      );
    }
    pushState();
    if (changed && !silent) soundCue(muted ? "mute" : "unmute");
  }

  const micTracks = () => {
    const list = [
      ...(micStream?.getAudioTracks() || []),
      ...(micChain?.track ? [micChain.track] : []),
      ...(micProducer?.track ? [micProducer.track] : []),
    ];
    return [...new Set(list)];
  };

  async function setTestMode(on) {
    if (!state.channelId || !state.joined) return false;
    if (on) {
      if (!micProducer) return false;
      heldEnabled = micTracks().map((track) => track.enabled);
      testHold = true;
      for (const track of micTracks()) track.enabled = true;
      await request("voice.pauseProducer", { producerId: micProducer.id, paused: true }).catch(
        () => {}
      );
    } else {
      testHold = false;
      micTracks().forEach((track, index) => {
        if (index < heldEnabled.length) track.enabled = heldEnabled[index];
      });
      heldEnabled = [];
      if (micProducer) {
        await request("voice.pauseProducer", {
          producerId: micProducer.id,
          paused: state.muted,
        }).catch(() => {});
      }
    }
    for (const key of new Set([...nodes.keys(), ...sinks.keys()])) applyKeyAudio(key);
    publish();
    return true;
  }

  async function setDeafened(deafened, silent = false) {
    const changed = state.deafened !== deafened;
    state.deafened = deafened;
    for (const key of new Set([...nodes.keys(), ...sinks.keys()])) applyKeyAudio(key);
    pushState();
    if (changed && !silent) soundCue(deafened ? "deafen" : "undeafen");
  }

  async function toggleMic() {
    if (!micProducer && (state.muted || state.micError)) {
      await requestMic();
      return;
    }
    if (state.muted && state.deafened) {
      await setDeafened(false, true);
      await setMuted(false);
      return;
    }
    await setMuted(!state.muted);
    if (!state.muted && state.deafened) await setDeafened(false, true);
  }

  async function toggleDeafen() {
    if (state.deafened) {
      await setDeafened(false);
      return;
    }
    await setDeafened(true);
    if (!state.muted) await setMuted(true, true);
  }

  async function startCamera() {
    if (camProducer) return;
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
      audio: false,
    });
    const track = camStream.getVideoTracks()[0];
    track.addEventListener("ended", () => stopCamera());
    camProducer = await sendTransport.produce({
      track,
      appData: { source: "camera" },
      encodings: [{ maxBitrate: 700000 }],
    });
    state.cam = true;
    local.camera = camStream;
    pushState();
    soundCue("cam-on");
  }

  async function stopCamera({ silent = false } = {}) {
    if (camProducer) {
      camProducer.close();
      await request("voice.closeProducer", { producerId: camProducer.id }).catch(() => {});
      camProducer = null;
    }
    camStream?.getTracks().forEach((track) => track.stop());
    camStream = null;
    local.camera = null;
    state.cam = false;
    if (silent) {
      publish();
    } else {
      pushState();
      soundCue("cam-off");
    }
  }

  async function toggleCamera() {
    if (camProducer) await stopCamera();
    else await startCamera();
  }

  const SCREEN = {
    "720": { width: 1280, height: 720, bitrate: { "30": 2000000, "60": 3500000, "120": 6000000 } },
    "1080": { width: 1920, height: 1080, bitrate: { "30": 4000000, "60": 7000000, "120": 12000000 } },
    "1440": { width: 2560, height: 1440, bitrate: { "30": 7000000, "60": 12000000, "120": 20000000 } },
  };
  let screenSig = "";
  let screenTimer = null;

  function screenMode(pref = settings() || {}) {
    const res = SCREEN[pref.streamRes] ? String(pref.streamRes) : "1080";
    const fps = ["30", "60", "120"].includes(String(pref.streamFps)) ? String(pref.streamFps) : "60";
    const preset = SCREEN[res];
    return { res, width: preset.width, height: preset.height, fps: Number(fps), bitrate: preset.bitrate[fps] };
  }

  function screenSignature(pref = settings() || {}) {
    const mode = screenMode(pref);
    return `${mode.res}|${mode.fps}`;
  }

  function screenConstraints(mode) {
    return { frameRate: { ideal: mode.fps, max: mode.fps } };
  }

  function captureScale(track, mode) {
    const info = track?.getSettings ? track.getSettings() : {};
    const width = Number(info.width) || 0;
    if (!width || width <= mode.width * 1.1) return 1;
    return Math.max(1, Number((width / mode.width).toFixed(2)));
  }

  function screenEncodings(track, mode) {
    return [{ maxBitrate: mode.bitrate, scaleResolutionDownBy: captureScale(track, mode) }];
  }

  async function takePickerPreset() {
    try {
      const preset = await window.nexus?.desktop?.streamPreset?.();
      if (!preset) return;
      const patch = {};
      if (preset.res && SCREEN[String(preset.res)]) patch.streamRes = String(preset.res);
      if (["30", "60", "120"].includes(String(preset.fps))) patch.streamFps = String(preset.fps);
      if (Object.keys(patch).length) prefs.patch(patch);
    } catch {
      /* настройки не выбирали — работаем с текущими */
    }
  }

  async function startScreen() {
    if (screenProducer) return;
    const initial = screenMode();
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: screenConstraints(initial),
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
    await takePickerPreset();
    const mode = screenMode();
    const track = screenStream.getVideoTracks()[0];
    track.contentHint = "detail";
    await track.applyConstraints(screenConstraints(mode)).catch(() => {});
    track.addEventListener("ended", () => stopScreen());
    screenProducer = await sendTransport.produce({
      track,
      appData: { source: "screen" },
      encodings: screenEncodings(track, mode),
    });
    const streamAudio = screenStream.getAudioTracks()[0];
    if (streamAudio) {
      streamAudio.contentHint = "music";
      screenAudioProducer = await sendTransport
        .produce({
          track: streamAudio,
          appData: { source: "screen" },
          codecOptions: { opusStereo: true, opusDtx: false, opusFec: true },
        })
        .catch(() => null);
      streamAudio.addEventListener("ended", () => {
        if (screenAudioProducer) {
          const audioProducer = screenAudioProducer;
          screenAudioProducer = null;
          try {
            audioProducer.close();
          } catch {
            /* уже закрыт */
          }
          request("voice.closeProducer", { producerId: audioProducer.id }).catch(() => {});
        }
      });
    }
    screenSig = screenSignature();
    state.stream = true;
    local.screen = new MediaStream([track]);
    pushState();
    soundCue("screen-on");
  }

  async function reencodeScreen() {
    const track = screenStream?.getVideoTracks()[0];
    if (!screenProducer || !track || !sendTransport) return;
    const mode = screenMode();
    await track.applyConstraints(screenConstraints(mode)).catch(() => {});
    const old = screenProducer;
    screenProducer = null;
    old.close();
    await request("voice.closeProducer", { producerId: old.id }).catch(() => {});
    screenProducer = await sendTransport.produce({
      track,
      appData: { source: "screen" },
      encodings: screenEncodings(track, mode),
    });
    screenSig = screenSignature();
    local.screen = new MediaStream([track]);
    publish();
  }

  async function stopScreen({ silent = false } = {}) {
    if (screenAudioProducer) {
      const audioProducer = screenAudioProducer;
      screenAudioProducer = null;
      try {
        audioProducer.close();
      } catch {
        /* уже закрыт */
      }
      await request("voice.closeProducer", { producerId: audioProducer.id }).catch(() => {});
    }
    if (screenProducer) {
      screenProducer.close();
      await request("voice.closeProducer", { producerId: screenProducer.id }).catch(() => {});
      screenProducer = null;
    }
    screenStream?.getTracks().forEach((track) => track.stop());
    screenStream = null;
    local.screen = null;
    state.stream = false;
    if (silent) {
      publish();
    } else {
      pushState();
      soundCue("screen-off");
    }
  }

  async function toggleScreen() {
    if (screenProducer) await stopScreen();
    else await startScreen();
  }

  function handle(event) {
    switch (event.t) {
      case "voice.reply": {
        const waiter = pending.get(event.req);
        if (!waiter) return;
        pending.delete(event.req);
        if (event.error) waiter.reject(new Error(event.error));
        else waiter.resolve(event);
        return;
      }
      case "voice.roster": {
        const seen = new Set();
        const unique = [];
        for (const member of event.members || []) {
          if (seen.has(member.userId)) continue;
          seen.add(member.userId);
          unique.push(member);
        }
        rosters.set(event.channelId, unique);
        publish();
        return;
      }
      case "voice.levels": {
        if (event.channelId && event.channelId !== state.channelId) return;
        levels.clear();
        for (const item of event.levels || [])
          levels.set(item.userId, Math.min(1, Math.max(0, Number(item.volume) || 0) / 64));
        const now = Date.now();
        if (now - levelsPublish < 140) return;
        levelsPublish = now;
        publish();
        return;
      }
      case "voice.newProducer": {
        if (event.userId === undefined) return;
        if (!state.joined) {
          pendingProducers.push(event);
          return;
        }
        consume({
          producerId: event.producerId,
          userId: event.userId,
          kind: event.kind,
          source: event.source,
        }).catch(() => {});
        return;
      }
      case "voice.producerClosed": {
        const entry = consumers.get(event.producerId);
        if (entry) {
          entry.consumer.close();
          consumers.delete(event.producerId);
          clearStream(entry.userId, entry.kind, entry.source);
        }
        return;
      }
      case "voice.consumerClosed": {
        for (const [producerId, entry] of [...consumers]) {
          if (entry.consumer.id === event.consumerId) {
            consumers.delete(producerId);
            clearStream(entry.userId, entry.kind, entry.source);
          }
        }
        return;
      }
      case "voice.peerLeft": {
        dropUser(event.userId);
        publish();
        return;
      }
      default:
        return;
    }
  }

  function micInfo() {
    return {
      raw: [...(micStream?.getAudioTracks() || [])].map((track) => track.enabled),
      processed: micChain?.track ? micChain.track.enabled : null,
      producer: micProducer?.track ? micProducer.track.enabled : null,
      noise: state.noise,
    };
  }

  async function stats() {
    const out = [];
    for (const entry of consumers.values()) {
      const receiver = entry.consumer.rtpReceiver;
      if (!receiver) continue;
      const report = await receiver.getStats();
      report.forEach((item) => {
        if (item.type !== "inbound-rtp") return;
        out.push({
          userId: entry.userId,
          kind: item.kind,
          source: entry.source,
          bytes: item.bytesReceived || 0,
          packets: item.packetsReceived || 0,
        });
      });
    }
    return out;
  }

  function reset() {
    for (const userId of remote.keys()) dropUser(userId);
    for (const key of new Set([...nodes.keys(), ...sinks.keys()])) dropKey(key);
    rosters.clear();
    levels.clear();
    state.channelId = null;
    state.joined = false;
    state.joining = false;
    state.error = null;
    state.micError = null;
    state.muted = false;
    state.deafened = false;
    state.cam = false;
    state.stream = false;
    publish();
  }

  return {
    store,
    handle,
    join,
    leave,
    reset,
    applySettings,
    restartMic,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    setMuted,
    setDeafened,
    setTestMode,
    setUserVolume,
    setUserMuted,
    requestMic,
    micTrack,
    micInfo,
    stats,
    audioDebug,
    screenMode,
    get state() {
      return state;
    },
  };
}
