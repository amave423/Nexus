export class Hub {
  constructor() {
    this.sockets = new Map();
    this.spaceOf = new Map();
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

}
