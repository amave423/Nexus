export class Hub {
  constructor() {
    this.sockets = new Map();
    this.spaceOf = new Map();
    this.voice = new Map();
  }

  add(userId, socket, spaceId) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId).add(socket);
    this.spaceOf.set(userId, spaceId);
  }

  remove(userId, socket) {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.spaceOf.delete(userId);
    }
  }

  onlineIds() {
    return [...this.sockets.keys()];
  }

  sendTo(userId, payload) {
    const set = this.sockets.get(userId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const socket of set) {
      if (socket.readyState === 1) socket.send(raw);
    }
  }

  broadcastSpace(spaceId, payload, exceptUserId = null) {
    const raw = JSON.stringify(payload);
    for (const [userId, socketSet] of this.sockets) {
      if (userId === exceptUserId) continue;
      if (this.spaceOf.get(userId) !== spaceId) continue;
      for (const socket of socketSet) {
        if (socket.readyState === 1) socket.send(raw);
      }
    }
  }

  joinVoice(userId, channelId, state = {}) {
    this.voice.set(userId, {
      channelId,
      muted: !!state.muted,
      cam: !!state.cam,
      stream: !!state.stream,
    });
  }

  leaveVoice(userId) {
    const entry = this.voice.get(userId);
    this.voice.delete(userId);
    return entry ? entry.channelId : null;
  }

  voiceChannelOf(userId) {
    const entry = this.voice.get(userId);
    return entry ? entry.channelId : null;
  }

  setVoiceState(userId, patch) {
    const entry = this.voice.get(userId);
    if (!entry) return;
    Object.assign(entry, patch);
  }

  voiceMembers(channelId) {
    const out = [];
    for (const [userId, entry] of this.voice) {
      if (entry.channelId !== channelId) continue;
      out.push({
        userId,
        muted: entry.muted,
        cam: entry.cam,
        stream: entry.stream,
      });
    }
    return out;
  }
}
