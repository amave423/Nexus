import { writable } from "svelte/store";
import { Device } from "mediasoup-client";
import { buildMicTrack } from "./noise.js";

const emptyRemote = () => ({ audio: null, camera: null, screen: null });

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

  const state = {
    channelId: null,
    joining: false,
    joined: false,
    error: null,
    muted: false,
    deafened: false,
    cam: false,
    stream: false,
    micLevel: 0,
  };

  const store = writable(snapshot());

  function snapshot() {
    return {
      channelId: state.channelId,
      joining: state.joining,
      joined: state.joined,
      error: state.error,
      muted: state.muted,
      deafened: state.deafened,
      cam: state.cam,
      stream: state.stream,
      micLevel: state.micLevel,
      rosters: new Map([...rosters].map(([id, members]) => [id, members.map((m) => ({ ...m }))])),
      remote: new Map([...remote].map(([id, value]) => [id, { ...value }])),
      local: { ...local },
      levels: new Map(levels),
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

  function dropUser(userId) {
    remote.delete(userId);
    for (const [producerId, entry] of [...consumers]) {
      if (entry.userId === userId) {
        entry.consumer.close();
        consumers.delete(producerId);
      }
    }
  }

  function setStream(userId, kind, source, stream) {
    const entry = remote.get(userId) || emptyRemote();
    if (kind === "audio") entry.audio = stream;
    else if (source === "screen") entry.screen = stream;
    else entry.camera = stream;
    remote.set(userId, entry);
    publish();
  }

  function clearStream(userId, kind, source) {
    const entry = remote.get(userId);
    if (!entry) return;
    if (kind === "audio") entry.audio = null;
    else if (source === "screen") entry.screen = null;
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
        state.micLevel = Math.min(1, sum / buffer.length / 90);
        publish();
      }, 120);
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

  async function startMic() {
    if (micProducer) return;
    const pref = settings() || {};
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: pref.micDevId ? { exact: pref.micDevId } : undefined,
        echoCancellation: pref.echoCancel !== false,
        noiseSuppression: pref.noiseSup !== false,
        autoGainControl: pref.autoGain !== false,
        channelCount: 1,
      },
      video: false,
    });
    let track = micStream.getAudioTracks()[0];
    try {
      micChain = await buildMicTrack(micStream, {
        level: pref.micLevel,
        mode: pref.noiseMode || "rnnoise",
      });
      track = micChain.track;
    } catch {
      micChain = null;
    }
    micProducer = await sendTransport.produce({
      track,
      appData: { source: "camera" },
      encodings: [{ maxBitrate: QUALITY[pref.quality] || 96000, dtx: true }],
      codecOptions: {
        opusStereo: false,
        opusDtx: true,
        opusFec: true,
        opusMaxPlaybackRate: 48000,
      },
    });
    local.mic = micStream;
    startMeter(track);
    if (state.muted) {
      track.enabled = false;
      await request("voice.pauseProducer", { producerId: micProducer.id, paused: true }).catch(
        () => {}
      );
    }
    publish();
  }

  async function stopMic() {
    stopMeter();
    micProducer?.close();
    micProducer = null;
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    micChain?.dispose();
    micChain = null;
    local.mic = null;
    publish();
  }

  async function join(channelId) {
    if (state.channelId === channelId && state.joined) return;
    if (state.channelId) await leave();
    leaving = false;
    Object.assign(state, { channelId, joining: true, joined: false, error: null });
    publish();
    try {
      const joined = await request("voice.join", { channelId });
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
      try {
        await startMic();
      } catch {
        state.muted = true;
        state.error = "no_mic";
      }
      state.joined = true;
      state.joining = false;
      pushState();
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

  async function setMuted(muted) {
    state.muted = muted;
    for (const track of micStream?.getAudioTracks() || []) track.enabled = !muted;
    if (micProducer) {
      await request("voice.pauseProducer", { producerId: micProducer.id, paused: muted }).catch(
        () => {}
      );
    }
    pushState();
  }

  function toggleMic() {
    return setMuted(!state.muted);
  }

  async function toggleDeafen() {
    state.deafened = !state.deafened;
    if (state.deafened && !state.muted) {
      await setMuted(true);
      return;
    }
    pushState();
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
    if (silent) publish();
    else pushState();
  }

  async function toggleCamera() {
    if (camProducer) await stopCamera();
    else await startCamera();
  }

  async function startScreen() {
    if (screenProducer) return;
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 15 } },
      audio: false,
    });
    const track = screenStream.getVideoTracks()[0];
    track.addEventListener("ended", () => stopScreen());
    screenProducer = await sendTransport.produce({
      track,
      appData: { source: "screen" },
      encodings: [{ maxBitrate: 1800000 }],
    });
    state.stream = true;
    local.screen = new MediaStream([track]);
    pushState();
  }

  async function stopScreen({ silent = false } = {}) {
    if (screenProducer) {
      screenProducer.close();
      await request("voice.closeProducer", { producerId: screenProducer.id }).catch(() => {});
      screenProducer = null;
    }
    screenStream?.getTracks().forEach((track) => track.stop());
    screenStream = null;
    local.screen = null;
    state.stream = false;
    if (silent) publish();
    else pushState();
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
        rosters.set(event.channelId, event.members || []);
        publish();
        return;
      }
      case "voice.levels": {
        if (event.channelId && event.channelId !== state.channelId) return;
        levels.clear();
        for (const item of event.levels || []) levels.set(item.userId, item.volume);
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
    rosters.clear();
    levels.clear();
    state.channelId = null;
    state.joined = false;
    state.joining = false;
    state.error = null;
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
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    setMuted,
    stats,
    get state() {
      return state;
    },
  };
}
