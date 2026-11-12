import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { hashCode, verifyCode, newToken, newInvite } from "./auth.js";
import { Hub } from "./realtime.js";
import { Voice } from "./voice.js";

const COLORS = ["#c8ff3d", "#6fe3ff", "#ff6b8a", "#ffb454", "#b18cff", "#7dffb0"];

export function buildApp({ db, logger = false, voice: injectedVoice = null }) {
  const app = Fastify({ logger });
  const hub = new Hub();

  const spaceOfChannel = (channelId) =>
    db.prepare("SELECT space_id AS spaceId FROM channels WHERE id = ?").get(channelId)?.spaceId;

  const voice = injectedVoice || new Voice();
  voice.sendTo = (userId, payload) => hub.sendTo(userId, payload);
  voice.broadcastSpace = (spaceId, payload) => hub.broadcastSpace(spaceId, payload);
  voice.spaceOfChannel = spaceOfChannel;
  voice.profileOf = (userId) =>
    db.prepare("SELECT id, name, avatar, color FROM users WHERE id = ?").get(userId) || null;

  app.decorate("db", db);
  app.decorate("hub", hub);
  app.decorate("voice", voice);

  app.register(websocket);

  const userByToken = (token) => {
    if (!token) return null;
    return (
      db
        .prepare(
          `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
        )
        .get(token) || null
    );
  };

  const auth = (req, reply) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const user = userByToken(token);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return null;
    }
    req.user = user;
    req.token = token;
    return user;
  };

  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    color: u.color,
  });

  const spacesOf = (userId) =>
    db
      .prepare(
        `SELECT s.id, s.name, m.role FROM spaces s
         JOIN space_members m ON m.space_id = s.id
         WHERE m.user_id = ? ORDER BY s.id`
      )
      .all(userId);

  const channelsOf = (spaceId) =>
    db
      .prepare(
        `SELECT id, name, type, topic, position FROM channels
         WHERE space_id = ? ORDER BY position, id`
      )
      .all(spaceId);

  const membersOf = (spaceId) =>
    db
      .prepare(
        `SELECT u.id, u.name, u.avatar, u.color, m.role FROM space_members m
         JOIN users u ON u.id = m.user_id WHERE m.space_id = ? ORDER BY m.joined_at`
      )
      .all(spaceId);

  const messageRow = (id) =>
    db
      .prepare(
        `SELECT m.id, m.channel_id AS channelId, m.user_id AS userId, m.text,
                m.created_at AS createdAt, u.name, u.avatar, u.color
         FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
      )
      .get(id);

  const canSeeChannel = (userId, channelId) =>
    !!db
      .prepare(
        `SELECT 1 FROM channels c JOIN space_members m ON m.space_id = c.space_id
         WHERE c.id = ? AND m.user_id = ?`
      )
      .get(channelId, userId);

  /* ---------- auth ---------- */

  app.post("/api/auth/register", async (req, reply) => {
    const { invite, name, code } = req.body || {};
    const cleanName = String(name || "").trim();
    if (cleanName.length < 2 || cleanName.length > 24)
      return reply.code(400).send({ error: "name_length" });
    if (String(code || "").length < 6)
      return reply.code(400).send({ error: "code_short" });

    const inv = db.prepare("SELECT * FROM invites WHERE code = ?").get(String(invite || ""));
    if (!inv) return reply.code(403).send({ error: "invite_invalid" });
    if (inv.max_uses > 0 && inv.uses >= inv.max_uses)
      return reply.code(403).send({ error: "invite_used" });

    const taken = db.prepare("SELECT 1 FROM users WHERE name_lc = ?").get(cleanName.toLowerCase());
    if (taken) return reply.code(409).send({ error: "name_taken" });

    const { hash, salt } = hashCode(code);
    const now = Date.now();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const info = db
      .prepare(
        `INSERT INTO users (name, name_lc, code_hash, code_salt, color, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(cleanName, cleanName.toLowerCase(), hash, salt, color, now, now);
    const userId = Number(info.lastInsertRowid);

    const memberCount = db
      .prepare("SELECT COUNT(*) AS n FROM space_members WHERE space_id = ?")
      .get(inv.space_id).n;
    db.prepare(
      "INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
    ).run(inv.space_id, userId, memberCount === 0 ? "owner" : "member", now);
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?").run(inv.code);

    const token = newToken();
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
      token,
      userId,
      now
    );
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { name, code } = req.body || {};
    const user = db
      .prepare("SELECT * FROM users WHERE name_lc = ?")
      .get(String(name || "").trim().toLowerCase());
    if (!user || !verifyCode(code, user.code_hash, user.code_salt))
      return reply.code(401).send({ error: "bad_credentials" });

    const token = newToken();
    const now = Date.now();
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
      token,
      user.id,
      now
    );
    db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(now, user.id);
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (!auth(req, reply)) return;
    db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
    return { ok: true };
  });

  app.get("/api/me", async (req, reply) => {
    if (!auth(req, reply)) return;
    return { user: publicUser(req.user) };
  });

  /* ---------- data ---------- */

  app.get("/api/bootstrap", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaces = spacesOf(req.user.id);
    const space = spaces[0];
    if (!space) return { user: publicUser(req.user), spaces: [], channels: [], members: [] };
    return {
      user: publicUser(req.user),
      spaces,
      channels: channelsOf(space.id),
      members: membersOf(space.id),
      online: hub.onlineIds(),
    };
  });

  app.get("/api/channels/:id/messages", async (req, reply) => {
    if (!auth(req, reply)) return;
    const channelId = Number(req.params.id);
    if (!canSeeChannel(req.user.id, channelId))
      return reply.code(403).send({ error: "forbidden" });
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = db
      .prepare(
        `SELECT m.id, m.channel_id AS channelId, m.user_id AS userId, m.text,
                m.created_at AS createdAt, u.name, u.avatar, u.color
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`
      )
      .all(channelId, before, limit);
    return { messages: rows.reverse() };
  });

  app.post("/api/channels/:id/messages", async (req, reply) => {
    if (!auth(req, reply)) return;
    const channelId = Number(req.params.id);
    if (!canSeeChannel(req.user.id, channelId))
      return reply.code(403).send({ error: "forbidden" });
    const text = String((req.body || {}).text || "").trim();
    if (!text) return reply.code(400).send({ error: "empty" });
    if (text.length > 4000) return reply.code(400).send({ error: "too_long" });

    const info = db
      .prepare("INSERT INTO messages (channel_id, user_id, text, created_at) VALUES (?, ?, ?, ?)")
      .run(channelId, req.user.id, text, Date.now());
    const message = messageRow(Number(info.lastInsertRowid));
    hub.broadcastSpace(spaceOfChannel(channelId), { t: "message", message });
    return { message };
  });

  app.post("/api/spaces/:id/invites", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    const member = db
      .prepare("SELECT role FROM space_members WHERE space_id = ? AND user_id = ?")
      .get(spaceId, req.user.id);
    if (!member || !["owner", "admin"].includes(member.role))
      return reply.code(403).send({ error: "forbidden" });
    const code = newInvite();
    db.prepare(
      "INSERT INTO invites (code, space_id, created_by, max_uses, uses, created_at) VALUES (?, ?, ?, ?, 0, ?)"
    ).run(code, spaceId, req.user.id, Number((req.body || {}).maxUses) || 0, Date.now());
    return { code };
  });

  app.get("/api/health", async () => ({ ok: true, uptime: process.uptime() }));

  /* ---------- realtime ---------- */

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket, req) => {
      const token = new URL(req.url, "http://x").searchParams.get("token");
      const user = userByToken(token);
      if (!user) {
        socket.close(4001, "unauthorized");
        return;
      }
      const space = spacesOf(user.id)[0];
      if (!space) {
        socket.close(4003, "no_space");
        return;
      }

      hub.add(user.id, socket, space.id);
      socket.send(JSON.stringify({ t: "ready", user: publicUser(user) }));
      hub.broadcastSpace(space.id, { t: "presence", online: hub.onlineIds() });

      socket.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        handleSocket(msg, user, space, socket).catch((error) => {
          console.error("[nexus] socket handler failed", error);
        });
      });

      socket.on("close", async () => {
        hub.remove(user.id, socket);
        if (!hub.sockets.has(user.id)) {
          const channelId = await voice.leave(user.id);
          if (channelId) voice.roster(channelId);
        }
        hub.broadcastSpace(space.id, { t: "presence", online: hub.onlineIds() });
      });
    });
  });

  async function handleSocket(msg, user, space, socket) {
    const reply = (payload) => {
      if (!msg.req) return;
      socket.send(JSON.stringify({ t: "voice.reply", req: msg.req, ...payload }));
    };
    const call = async (fn) => {
      try {
        const data = (await fn()) || {};
        reply({ ok: true, ...data });
      } catch (error) {
        reply({ error: error.code || "voice_failed" });
      }
    };

    switch (msg.t) {
      case "typing": {
        const channelId = Number(msg.channelId);
        if (!canSeeChannel(user.id, channelId)) return;
        hub.broadcastSpace(
          space.id,
          { t: "typing", channelId, userId: user.id, name: user.name },
          user.id
        );
        return;
      }
      case "voice.join": {
        const channelId = Number(msg.channelId);
        const channel = db
          .prepare("SELECT space_id AS spaceId, type FROM channels WHERE id = ?")
          .get(channelId);
        if (!channel || channel.spaceId !== space.id || !canSeeChannel(user.id, channelId)) {
          reply({ error: "forbidden" });
          return;
        }
        if (channel.type !== "voice") {
          reply({ error: "not_voice" });
          return;
        }
        await call(() => voice.join(user.id, channelId));
        return;
      }
      case "voice.leave": {
        await call(async () => {
          const channelId = await voice.leave(user.id);
          if (channelId) voice.roster(channelId);
          return { channelId };
        });
        return;
      }
      case "voice.createTransport":
        await call(() => voice.createTransport(user.id, msg.direction));
        return;
      case "voice.connectTransport":
        await call(() => voice.connectTransport(user.id, msg.transportId, msg.dtlsParameters));
        return;
      case "voice.produce":
        await call(() => voice.produce(user.id, msg));
        return;
      case "voice.consume":
        await call(() => voice.consume(user.id, msg));
        return;
      case "voice.resumeConsumer":
        await call(() => voice.resumeConsumer(user.id, msg.consumerId));
        return;
      case "voice.pauseProducer":
        await call(() => voice.setProducerPaused(user.id, msg.producerId, !!msg.paused));
        return;
      case "voice.closeProducer":
        await call(() => voice.closeProducer(user.id, msg.producerId));
        return;
      case "voice.state": {
        if (!voice.channelOf(user.id)) return;
        voice.setState(user.id, {
          muted: !!msg.muted,
          deafened: !!msg.deafened,
          cam: !!msg.cam,
          stream: !!msg.stream,
        });
        return;
      }
      default:
        return;
    }
  }

  app.decorate("ensureInvite", () => {
    const existing = db.prepare("SELECT code FROM invites LIMIT 1").get();
    if (existing) return existing.code;
    const space = db.prepare("SELECT id FROM spaces ORDER BY id LIMIT 1").get();
    if (!space) return null;
    const code = newInvite();
    db.prepare(
      "INSERT INTO invites (code, space_id, created_by, max_uses, uses, created_at) VALUES (?, ?, NULL, 0, 0, ?)"
    ).run(code, space.id, Date.now());
    return code;
  });

  return app;
}
