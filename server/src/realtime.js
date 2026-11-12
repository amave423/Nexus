export class Hub {
  constructor() {
    this.sockets = new Map();
    this.spaces = new Map();
  }

  add(userId, socket) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId).add(socket);
  }

  setSpaces(userId, spaceIds) {
    this.spaces.set(userId, new Set(spaceIds));
  }

  spacesOf(userId) {
    return this.spaces.get(userId) || new Set();
  }

  remove(userId, socket) {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.spaces.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId) {
    return this.sockets.has(userId);
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
      if (!this.spacesOf(userId).has(spaceId)) continue;
      for (const socket of socketSet) {
        if (socket.readyState === 1) socket.send(raw);
      }
    }
  }
}
