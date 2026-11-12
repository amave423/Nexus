import * as mediasoup from "mediasoup";

const MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: { useinbandfec: 1, minptime: 10 },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 700 },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 700,
    },
  },
];

const MAX_INCOMING = 4_000_000;

export class VoiceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export class Voice {
  constructor(options = {}) {
    this.announced =
      options.announcedAddress || process.env.NEXUS_RTC_ANNOUNCED || "127.0.0.1";
    this.udp = {
      min: num(options.rtcMinPort ?? process.env.NEXUS_RTC_MIN, 40000),
      max: num(options.rtcMaxPort ?? process.env.NEXUS_RTC_MAX, 40100),
    };
    this.tcp = {
      min: num(options.rtcTcpMinPort ?? process.env.NEXUS_RTC_TCP_MIN, 4443),
      max: num(options.rtcTcpMaxPort ?? process.env.NEXUS_RTC_TCP_MAX, 4453),
    };
    this.sendTo = options.sendTo || (() => {});
    this.broadcastSpace = options.broadcastSpace || (() => {});
    this.spaceOfChannel = options.spaceOfChannel || (() => null);
    this.profileOf = options.profileOf || (() => null);

    this.channels = new Map();
    this.peers = new Map();
    this.ready = null;
  }

  init() {
    if (!this.ready) this.ready = this.start();
    return this.ready;
  }

  async start() {
    this.worker = await mediasoup.createWorker({ logLevel: "warn" });
    this.worker.on("died", (error) => {
      console.error("[voice] mediasoup worker died", error);
      this.worker = null;
      this.ready = null;
      for (const channel of this.channels.values()) channel.router.close();
      this.channels.clear();
      this.peers.clear();
    });
    return this.worker;
  }

  async close() {
    for (const channel of this.channels.values()) channel.router.close();
    this.channels.clear();
    this.peers.clear();
    this.worker?.close();
    this.worker = null;
    this.ready = null;
  }

  async channel(channelId) {
    const existing = this.channels.get(channelId);
    if (existing) return existing;
    await this.init();
    if (!this.worker) {
      await this.init();
      if (!this.worker) throw new VoiceError("worker_down");
    }
    const router = await this.worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    const observer = await router.createAudioLevelObserver({
      maxEntries: 24,
      threshold: -55,
      interval: 350,
      silenceThreshold: -75,
    });
    const entry = {
      channelId,
      router,
      observer,
      peers: new Map(),
      producerOwner: new Map(),
      speaking: new Set(),
    };
    observer.on("volumes", (volumes) => {
      entry.speaking.clear();
      const levels = [];
      for (const item of volumes) {
        const userId = entry.producerOwner.get(item.producer.id);
        if (!userId) continue;
        entry.speaking.add(userId);
        levels.push({ userId, volume: item.volume });
      }
      this.toChannel(entry.channelId, { t: "voice.levels", levels });
    });
    observer.on("silence", () => {
      entry.speaking.clear();
      this.toChannel(entry.channelId, { t: "voice.levels", levels: [] });
    });
    this.channels.set(channelId, entry);
    return entry;
  }

  toChannel(channelId, payload, exceptUserId = null) {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    for (const userId of channel.peers.keys()) {
      if (userId === exceptUserId) continue;
      this.sendTo(userId, payload);
    }
  }

  roster(channelId) {
    const spaceId = this.spaceOfChannel(channelId);
    if (!spaceId) return;
    this.broadcastSpace(spaceId, {
      t: "voice.roster",
      channelId,
      members: this.members(channelId),
    });
  }

  members(channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) return [];
    return [...channel.peers.values()].map((peer) => {
      const profile = (this.profileOf && this.profileOf(peer.userId)) || {};
      return {
        userId: peer.userId,
        name: profile.name || null,
        color: profile.color || null,
        avatar: profile.avatar || null,
        muted: peer.state.muted,
        deafened: peer.state.deafened,
        cam: peer.state.cam,
        stream: peer.state.stream,
        speaking: channel.speaking.has(peer.userId),
      };
    });
  }

  peer(userId) {
    const peer = this.peers.get(userId);
    if (!peer) throw new VoiceError("not_in_voice");
    return peer;
  }

  transportOf(peer, transportId) {
    for (const transport of [peer.send, peer.recv]) {
      if (transport && transport.id === transportId) return transport;
    }
    throw new VoiceError("no_transport");
  }

  async join(userId, channelId) {
    const current = this.peers.get(userId);
    if (current) {
      if (current.channelId === channelId) return this.snapshot(current);
      await this.leave(userId);
    }
    const channel = await this.channel(channelId);
    const peer = {
      userId,
      channelId,
      send: null,
      recv: null,
      producers: new Map(),
      consumers: new Map(),
      state: { muted: true, deafened: false, cam: false, stream: false },
    };
    channel.peers.set(userId, peer);
    this.peers.set(userId, peer);
    this.toChannel(channelId, { t: "voice.peerJoined", userId }, userId);
    this.roster(channelId);
    return this.snapshot(peer);
  }

  snapshot(peer) {
    const channel = this.channels.get(peer.channelId);
    return {
      channelId: peer.channelId,
      rtpCapabilities: channel.router.rtpCapabilities,
      peers: [...channel.peers.values()]
        .filter((other) => other.userId !== peer.userId)
        .map((other) => ({
          userId: other.userId,
          producers: [...other.producers.values()].map((producer) => ({
            producerId: producer.id,
            kind: producer.kind,
            source: producer.appData.source,
            paused: producer.paused,
          })),
        })),
    };
  }

  async createTransport(userId, direction) {
    if (direction !== "send" && direction !== "recv") throw new VoiceError("bad_direction");
    const peer = this.peer(userId);
    const channel = this.channels.get(peer.channelId);
    const transport = await channel.router.createWebRtcTransport({
      listenInfos: [
        {
          protocol: "udp",
          ip: "0.0.0.0",
          announcedAddress: this.announced,
          portRange: { min: this.udp.min, max: this.udp.max },
        },
        {
          protocol: "tcp",
          ip: "0.0.0.0",
          announcedAddress: this.announced,
          portRange: { min: this.tcp.min, max: this.tcp.max },
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
    });
    transport.on("dtlsstatechange", (state) => {
      if (state === "failed" || state === "closed") transport.close();
    });
    try {
      await transport.setMaxIncomingBitrate(MAX_INCOMING);
    } catch {
      /* not fatal */
    }
    peer[direction] = transport;
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(userId, transportId, dtlsParameters) {
    const peer = this.peer(userId);
    const transport = this.transportOf(peer, transportId);
    await transport.connect({ dtlsParameters });
    return { ok: true };
  }

  async produce(userId, { transportId, kind, rtpParameters, source, paused }) {
    const peer = this.peer(userId);
    if (kind !== "audio" && kind !== "video") throw new VoiceError("bad_kind");
    const src = source === "screen" ? "screen" : "camera";
    if (kind === "audio" && src === "screen") throw new VoiceError("bad_source");
    const channel = this.channels.get(peer.channelId);
    for (const producer of peer.producers.values()) {
      if (producer.kind === kind && producer.appData.source === src)
        throw new VoiceError("already_producing");
    }
    const transport = this.transportOf(peer, transportId);
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { userId, source: src },
      paused: !!paused,
    });
    producer.on("transportclose", () => producer.close());
    peer.producers.set(producer.id, producer);
    channel.producerOwner.set(producer.id, userId);
    if (kind === "audio") {
      try {
        await channel.observer.addProducer({ producerId: producer.id });
      } catch {
        /* observer may be closed */
      }
    }
    this.toChannel(
      peer.channelId,
      {
        t: "voice.newProducer",
        userId,
        producerId: producer.id,
        kind,
        source: src,
        paused: producer.paused,
      },
      userId
    );
    if (src === "screen") this.setState(userId, { stream: true });
    if (src === "camera" && kind === "video") this.setState(userId, { cam: true });
    return { id: producer.id };
  }

  async consume(userId, { transportId, producerId, rtpCapabilities }) {
    const peer = this.peer(userId);
    const channel = this.channels.get(peer.channelId);
    const owner = channel.producerOwner.get(producerId);
    if (!owner) throw new VoiceError("no_producer");
    if (owner === userId) throw new VoiceError("own_producer");
    if (!rtpCapabilities || !channel.router.canConsume({ producerId, rtpCapabilities }))
      throw new VoiceError("cannot_consume");
    const transport = this.transportOf(peer, transportId);
    const producer = channel.peers.get(owner)?.producers.get(producerId);
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });
    consumer.on("transportclose", () => consumer.close());
    consumer.on("producerclose", () => {
      peer.consumers.delete(consumer.id);
      this.sendTo(userId, { t: "voice.consumerClosed", consumerId: consumer.id });
    });
    peer.consumers.set(consumer.id, consumer);
    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: producer ? producer.paused : consumer.producerPaused,
      appData: consumer.appData,
      userId: owner,
      source: producer ? producer.appData.source : "camera",
    };
  }

  async resumeConsumer(userId, consumerId) {
    const peer = this.peer(userId);
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new VoiceError("no_consumer");
    await consumer.resume();
    return { ok: true };
  }

  async setProducerPaused(userId, producerId, paused) {
    const peer = this.peer(userId);
    const producer = peer.producers.get(producerId);
    if (!producer) throw new VoiceError("no_producer");
    if (paused) await producer.pause();
    else await producer.resume();
    return { ok: true };
  }

  async closeProducer(userId, producerId) {
    const peer = this.peer(userId);
    const producer = peer.producers.get(producerId);
    if (!producer) throw new VoiceError("no_producer");
    const channel = this.channels.get(peer.channelId);
    const kind = producer.kind;
    const source = producer.appData.source;
    producer.close();
    peer.producers.delete(producerId);
    channel.producerOwner.delete(producerId);
    try {
      await channel.observer.removeProducer({ producerId });
    } catch {
      /* not in observer */
    }
    this.toChannel(peer.channelId, { t: "voice.producerClosed", producerId, userId });
    if (kind === "video") {
      if (source === "screen") this.setState(userId, { stream: false });
      else this.setState(userId, { cam: false });
    }
    return { ok: true };
  }

  setState(userId, patch) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    Object.assign(peer.state, patch);
    this.roster(peer.channelId);
  }

  async leave(userId) {
    const peer = this.peers.get(userId);
    if (!peer) return null;
    this.peers.delete(userId);
    const channel = this.channels.get(peer.channelId);
    for (const producer of peer.producers.values()) producer.close();
    for (const consumer of peer.consumers.values()) consumer.close();
    peer.send?.close();
    peer.recv?.close();
    peer.producers.clear();
    peer.consumers.clear();
    if (!channel) return peer.channelId;
    channel.peers.delete(userId);
    for (const [producerId, owner] of channel.producerOwner) {
      if (owner === userId) channel.producerOwner.delete(producerId);
    }
    channel.speaking.delete(userId);
    if (channel.peers.size === 0) {
      channel.router.close();
      this.channels.delete(peer.channelId);
    } else {
      this.toChannel(peer.channelId, { t: "voice.producerClosed", userId });
      this.toChannel(peer.channelId, { t: "voice.peerLeft", userId });
    }
    this.roster(peer.channelId);
    return peer.channelId;
  }

  channelOf(userId) {
    return this.peers.get(userId)?.channelId ?? null;
  }
}
