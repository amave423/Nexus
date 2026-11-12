import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { hashCode, verifyCode, newToken, newInvite } from "./auth.js";
import { Hub } from "./realtime.js";
import { Voice } from "./voice.js";
import { seedRoles } from "./db.js";

const COLORS = ["#c8ff3d", "#6fe3ff", "#ff6b8a", "#ffb454", "#b18cff", "#7dffb0"];
const STATUSES = ["online", "idle", "dnd", "invisible"];
const PERMISSIONS = [
  "manage_server",
  "manage_roles",
  "manage_members",
  "manage_invites",
  "manage_messages",
  "send_messages",
];

const BASE_PERMISSIONS = {
  owner: PERMISSIONS,
  admin: ["manage_roles", "manage_members", "manage_invites", "manage_messages", "send_messages"],
  member: ["send_messages"],
};

export function buildApp({ db, logger = false, voice: injectedVoice = null, uploadDir = null }) {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024 });
  const hub = new Hub();
  const filesDir = uploadDir || join(process.cwd(), "data", "uploads");
  mkdirSync(filesDir, { recursive: true });

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
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body)
  );

  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header(
      "access-control-allow-headers",
      "content-type, authorization, x-file-type, x-file-name"
    );
    reply.header("access-control-allow-methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    reply.header("access-control-max-age", "86400");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

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
    about: u.about || "",
    status: u.status || "online",
  });

  const spacesOf = (userId) =>
    db
      .prepare(
        `SELECT s.id, s.name, s.description, s.owner_id AS ownerId, m.role FROM spaces s
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

  const parseRole = (row) => ({ ...row, permissions: JSON.parse(row.permissions || "[]") });

  const rolesOf = (spaceId) =>
    db
      .prepare(
        `SELECT id, name, color, position, permissions FROM roles
         WHERE space_id = ? ORDER BY position, id`
      )
      .all(spaceId)
      .map(parseRole);

  const rolesOfUser = (spaceId, userId) =>
    db
      .prepare(
        `SELECT r.id, r.name, r.color, r.position, r.permissions FROM member_roles mr
         JOIN roles r ON r.id = mr.role_id
         WHERE mr.space_id = ? AND mr.user_id = ? ORDER BY r.position, r.id`
      )
      .all(spaceId, userId)
      .map(parseRole);

  const baseRole = (spaceId, userId) =>
    db
      .prepare("SELECT role FROM space_members WHERE space_id = ? AND user_id = ?")
      .get(spaceId, userId)?.role || null;

  const permissionsOf = (spaceId, userId) => {
    const base = baseRole(spaceId, userId);
    if (!base) return [];
    const set = new Set(BASE_PERMISSIONS[base] || []);
    for (const role of rolesOfUser(spaceId, userId)) {
      for (const perm of role.permissions) set.add(perm);
    }
    return [...set];
  };

  const can = (spaceId, userId, perm) => permissionsOf(spaceId, userId).includes(perm);

  const membersOf = (spaceId) =>
    db
      .prepare(
        `SELECT u.id, u.name, u.avatar, u.color, u.about, u.status, m.role, m.joined_at AS joinedAt
         FROM space_members m JOIN users u ON u.id = m.user_id
         WHERE m.space_id = ? ORDER BY m.joined_at`
      )
      .all(spaceId)
      .map((m) => ({ ...m, roles: rolesOfUser(spaceId, m.id) }));

  const memberOf = (spaceId, userId) => membersOf(spaceId).find((m) => m.id === userId) || null;

  const attachmentsOf = (messageId) =>
    db
      .prepare(
        "SELECT id, url, name, mime, size, width, height FROM attachments WHERE message_id = ? ORDER BY id"
      )
      .all(messageId);

  const reactionsOf = (messageId, viewerId) => {
    const rows = db
      .prepare(
        `SELECT emoji, COUNT(*) AS count, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
         FROM reactions WHERE message_id = ? GROUP BY emoji ORDER BY MIN(created_at)`
      )
      .all(viewerId, messageId);
    return rows.map((r) => ({ emoji: r.emoji, count: r.count, mine: !!r.mine }));
  };

  const replyOf = (messageId) => {
    if (!messageId) return null;
    const row = db
      .prepare(
        `SELECT m.id, m.text, m.deleted, u.name, u.color FROM messages m
         JOIN users u ON u.id = m.user_id WHERE m.id = ?`
      )
      .get(messageId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      text: row.deleted ? "сообщение удалено" : row.text.slice(0, 180),
    };
  };

  const messageRow = (id, viewerId = 0) => {
    const row = db
      .prepare(
        `SELECT m.id, m.channel_id AS channelId, m.user_id AS userId, m.text,
                m.created_at AS createdAt, m.edited_at AS editedAt, m.deleted,
                m.reply_to AS replyTo, u.name, u.avatar, u.color
         FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
      )
      .get(id);
    if (!row) return null;
    const pinned = !!db.prepare("SELECT 1 FROM pins WHERE message_id = ?").get(id);
    return {
      id: row.id,
      channelId: row.channelId,
      userId: row.userId,
      text: row.deleted ? "" : row.text,
      createdAt: row.createdAt,
      editedAt: row.editedAt || null,
      deleted: !!row.deleted,
      name: row.name,
      avatar: row.avatar,
      color: row.color,
      reply: replyOf(row.replyTo),
      attachments: row.deleted ? [] : attachmentsOf(id),
      reactions: reactionsOf(id, viewerId),
      pinned,
    };
  };

  const canSeeChannel = (userId, channelId) =>
    !!db
      .prepare(
        `SELECT 1 FROM channels c JOIN space_members m ON m.space_id = c.space_id
         WHERE c.id = ? AND m.user_id = ?`
      )
      .get(channelId, userId);

  const spaceIdsOf = (userId) =>
    db.prepare("SELECT space_id AS id FROM space_members WHERE user_id = ?").all(userId).map((r) => r.id);

  const statusOf = (user) => {
    const status = user.status || "online";
    return status === "invisible" ? "offline" : status;
  };

  const presenceOf = (spaceId) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.status FROM space_members m JOIN users u ON u.id = m.user_id
         WHERE m.space_id = ?`
      )
      .all(spaceId);
    const online = [];
    const statuses = {};
    for (const row of rows) {
      const status = hub.isOnline(row.id) ? statusOf(row) : "offline";
      statuses[row.id] = status;
      if (status !== "offline") online.push(row.id);
    }
    return { online, statuses };
  };

  const broadcastPresence = (userId) => {
    for (const spaceId of hub.spacesOf(userId)) {
      hub.broadcastSpace(spaceId, { t: "presence", ...presenceOf(spaceId) });
    }
  };

  const stateOf = (spaceId, userId) => {
    const space = spacesOf(userId).find((s) => s.id === spaceId);
    if (!space) return null;
    return {
      space,
      channels: channelsOf(spaceId),
      members: membersOf(spaceId),
      roles: rolesOf(spaceId),
      permissions: permissionsOf(spaceId, userId),
      ...presenceOf(spaceId),
    };
  };

  const inviteRow = (code) =>
    db
      .prepare(
        `SELECT i.code, i.space_id AS spaceId, i.max_uses AS maxUses, i.uses,
                i.expires_at AS expiresAt, i.revoked, i.created_at AS createdAt,
                u.name AS createdBy
         FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.code = ?`
      )
      .get(code);

  const inviteAlive = (inv) =>
    inv && !inv.revoked && (!inv.expiresAt || inv.expiresAt > Date.now()) &&
    (inv.maxUses === 0 || inv.uses < inv.maxUses);

  /* ---------- auth ---------- */

  app.post("/api/auth/register", async (req, reply) => {
    const { invite, name, code } = req.body || {};
    const cleanName = String(name || "").trim();
    if (cleanName.length < 2 || cleanName.length > 24)
      return reply.code(400).send({ error: "name_length" });
    if (String(code || "").length < 6)
      return reply.code(400).send({ error: "code_short" });

    const inv = inviteRow(String(invite || ""));
    if (!inviteAlive(inv)) return reply.code(403).send({ error: "invite_invalid" });

    const taken = db.prepare("SELECT 1 FROM users WHERE name_lc = ?").get(cleanName.toLowerCase());
    if (taken) return reply.code(409).send({ error: "name_taken" });

    const { hash, salt } = hashCode(code);
    const now = Date.now();
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const info = db
      .prepare(
        `INSERT INTO users (name, name_lc, code_hash, code_salt, color, about, status, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, '', 'online', ?, ?)`
      )
      .run(cleanName, cleanName.toLowerCase(), hash, salt, color, now, now);
    const userId = Number(info.lastInsertRowid);

    const memberCount = db
      .prepare("SELECT COUNT(*) AS n FROM space_members WHERE space_id = ?")
      .get(inv.spaceId).n;
    const isOwner = memberCount === 0;
    db.prepare(
      "INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
    ).run(inv.spaceId, userId, isOwner ? "owner" : "member", now);
    if (isOwner) db.prepare("UPDATE spaces SET owner_id = ? WHERE id = ?").run(userId, inv.spaceId);
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?").run(inv.code);

    const token = newToken();
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
      token,
      userId,
      now
    );
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    hub.broadcastSpace(inv.spaceId, {
      t: "member.update",
      member: memberOf(inv.spaceId, userId),
    });
    hub.broadcastSpace(inv.spaceId, { t: "presence", ...presenceOf(inv.spaceId) });
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

  app.patch("/api/me", async (req, reply) => {
    if (!auth(req, reply)) return;
    const body = req.body || {};
    const patch = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 24) return reply.code(400).send({ error: "name_length" });
      const taken = db
        .prepare("SELECT 1 FROM users WHERE name_lc = ? AND id <> ?")
        .get(name.toLowerCase(), req.user.id);
      if (taken) return reply.code(409).send({ error: "name_taken" });
      patch.name = name;
      patch.name_lc = name.toLowerCase();
    }
    if (body.about !== undefined) patch.about = String(body.about).slice(0, 280);
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return reply.code(400).send({ error: "bad_status" });
      patch.status = body.status;
    }
    if (body.avatar !== undefined) {
      if (body.avatar === null) patch.avatar = null;
      else {
        const avatar = String(body.avatar);
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(avatar))
          return reply.code(400).send({ error: "bad_avatar" });
        if (avatar.length > 400_000) return reply.code(413).send({ error: "avatar_too_big" });
        patch.avatar = avatar;
      }
    }

    const keys = Object.keys(patch);
    if (keys.length) {
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
        ...keys.map((k) => patch[k]),
        req.user.id
      );
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    for (const spaceId of hub.spacesOf(req.user.id)) {
      hub.broadcastSpace(spaceId, {
        t: "member.update",
        member: memberOf(spaceId, req.user.id),
      });
    }
    if (patch.status !== undefined) broadcastPresence(req.user.id);
    return { user: publicUser(user) };
  });

  /* ---------- data ---------- */

  app.get("/api/bootstrap", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaces = spacesOf(req.user.id).map((s) => ({ ...s, channels: channelsOf(s.id) }));
    const space = spaces[0];
    if (!space)
      return { user: publicUser(req.user), spaces: [], channels: [], members: [], roles: [] };
    return { user: publicUser(req.user), spaces, ...stateOf(space.id, req.user.id) };
  });

  app.get("/api/spaces/:id/state", async (req, reply) => {
    if (!auth(req, reply)) return;
    const state = stateOf(Number(req.params.id), req.user.id);
    if (!state) return reply.code(403).send({ error: "forbidden" });
    return state;
  });

  app.post("/api/spaces", async (req, reply) => {
    if (!auth(req, reply)) return;
    const name = String((req.body || {}).name || "").trim();
    if (name.length < 2 || name.length > 40) return reply.code(400).send({ error: "name_length" });
    const now = Date.now();
    const info = db
      .prepare("INSERT INTO spaces (name, description, owner_id, created_at) VALUES (?, '', ?, ?)")
      .run(name, req.user.id, now);
    const spaceId = Number(info.lastInsertRowid);
    db.prepare(
      "INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
    ).run(spaceId, req.user.id, now);
    seedRoles(db, spaceId);
    const ins = db.prepare(
      "INSERT INTO channels (space_id, name, type, topic, position) VALUES (?, ?, ?, '', ?)"
    );
    ins.run(spaceId, "general", "text", 0);
    ins.run(spaceId, "Кухня", "voice", 1);
    hub.setSpaces(req.user.id, spaceIdsOf(req.user.id));
    return stateOf(spaceId, req.user.id);
  });

  app.post("/api/invites/:code/join", async (req, reply) => {
    if (!auth(req, reply)) return;
    const inv = inviteRow(String(req.params.code));
    if (!inviteAlive(inv)) return reply.code(403).send({ error: "invite_invalid" });
    const now = Date.now();
    if (!baseRole(inv.spaceId, req.user.id)) {
      db.prepare(
        "INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)"
      ).run(inv.spaceId, req.user.id, now);
      db.prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?").run(inv.code);
      hub.broadcastSpace(inv.spaceId, {
        t: "member.update",
        member: memberOf(inv.spaceId, req.user.id),
      });
      hub.broadcastSpace(inv.spaceId, { t: "presence", ...presenceOf(inv.spaceId) });
    }
    hub.setSpaces(req.user.id, spaceIdsOf(req.user.id));
    return stateOf(inv.spaceId, req.user.id);
  });

  app.get("/api/channels/:id/messages", async (req, reply) => {
    if (!auth(req, reply)) return;
    const channelId = Number(req.params.id);
    if (!canSeeChannel(req.user.id, channelId))
      return reply.code(403).send({ error: "forbidden" });
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const after = Number(req.query.after) || 0;
    const rows = after
      ? db
          .prepare("SELECT id FROM messages WHERE channel_id = ? AND id > ? ORDER BY id ASC LIMIT ?")
          .all(channelId, after, limit)
      : db
          .prepare("SELECT id FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT ?")
          .all(channelId, before, limit);
    const ids = rows.map((r) => r.id);
    if (!after) ids.reverse();
    return { messages: ids.map((id) => messageRow(id, req.user.id)) };
  });

  app.post("/api/channels/:id/messages", async (req, reply) => {
    if (!auth(req, reply)) return;
    const channelId = Number(req.params.id);
    if (!canSeeChannel(req.user.id, channelId))
      return reply.code(403).send({ error: "forbidden" });
    const spaceId = spaceOfChannel(channelId);
    if (!can(spaceId, req.user.id, "send_messages"))
      return reply.code(403).send({ error: "forbidden" });
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const files = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
    if (!text && !files.length) return reply.code(400).send({ error: "empty" });
    if (text.length > 4000) return reply.code(400).send({ error: "too_long" });

    let replyTo = null;
    if (body.replyTo) {
      const target = db
        .prepare("SELECT id, channel_id AS channelId FROM messages WHERE id = ?")
        .get(Number(body.replyTo));
      if (target && target.channelId === channelId) replyTo = target.id;
    }

    const now = Date.now();
    const info = db
      .prepare(
        "INSERT INTO messages (channel_id, user_id, text, created_at, reply_to) VALUES (?, ?, ?, ?, ?)"
      )
      .run(channelId, req.user.id, text, now, replyTo);
    const messageId = Number(info.lastInsertRowid);

    const insFile = db.prepare(
      "INSERT INTO attachments (message_id, url, name, mime, size, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const file of files) {
      const url = String(file.url || "");
      if (!/^\/api\/files\/[a-z0-9]+\.[a-z0-9]+$/i.test(url)) continue;
      insFile.run(
        messageId,
        url,
        String(file.name || "файл").slice(0, 120),
        String(file.mime || "application/octet-stream").slice(0, 80),
        Number(file.size) || 0,
        Number(file.width) || null,
        Number(file.height) || null
      );
    }

    const message = messageRow(messageId, req.user.id);
    hub.broadcastSpace(spaceId, { t: "message", message });
    return { message };
  });

  app.patch("/api/messages/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(req.params.id));
    if (!row || row.deleted) return reply.code(404).send({ error: "not_found" });
    const spaceId = spaceOfChannel(row.channel_id);
    const own = row.user_id === req.user.id;
    if (!own && !can(spaceId, req.user.id, "manage_messages"))
      return reply.code(403).send({ error: "forbidden" });
    const text = String((req.body || {}).text || "").trim();
    if (!text) return reply.code(400).send({ error: "empty" });
    if (text.length > 4000) return reply.code(400).send({ error: "too_long" });
    db.prepare("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?").run(text, Date.now(), row.id);
    const message = messageRow(row.id, req.user.id);
    hub.broadcastSpace(spaceId, { t: "message.update", message });
    return { message };
  });

  app.delete("/api/messages/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: "not_found" });
    const spaceId = spaceOfChannel(row.channel_id);
    const own = row.user_id === req.user.id;
    if (!own && !can(spaceId, req.user.id, "manage_messages"))
      return reply.code(403).send({ error: "forbidden" });
    db.prepare("UPDATE messages SET deleted = 1, text = '' WHERE id = ?").run(row.id);
    db.prepare("DELETE FROM attachments WHERE message_id = ?").run(row.id);
    db.prepare("DELETE FROM reactions WHERE message_id = ?").run(row.id);
    db.prepare("DELETE FROM pins WHERE message_id = ?").run(row.id);
    hub.broadcastSpace(spaceId, {
      t: "message.delete",
      messageId: row.id,
      channelId: row.channel_id,
    });
    return { ok: true };
  });

  app.put("/api/messages/:id/reactions", async (req, reply) => {
    if (!auth(req, reply)) return;
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(req.params.id));
    if (!row || row.deleted) return reply.code(404).send({ error: "not_found" });
    const spaceId = spaceOfChannel(row.channel_id);
    if (!canSeeChannel(req.user.id, row.channel_id))
      return reply.code(403).send({ error: "forbidden" });
    const emoji = String((req.body || {}).emoji || "").trim();
    if (!emoji || [...emoji].length > 8) return reply.code(400).send({ error: "bad_emoji" });
    const existing = db
      .prepare("SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .get(row.id, req.user.id, emoji);
    if (existing)
      db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?").run(
        row.id,
        req.user.id,
        emoji
      );
    else
      db.prepare(
        "INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)"
      ).run(row.id, req.user.id, emoji, Date.now());
    const reactions = reactionsOf(row.id, req.user.id);
    hub.broadcastSpace(spaceId, { t: "message.reactions", messageId: row.id, reactions });
    return { reactions };
  });

  app.get("/api/channels/:id/pins", async (req, reply) => {
    if (!auth(req, reply)) return;
    const channelId = Number(req.params.id);
    if (!canSeeChannel(req.user.id, channelId))
      return reply.code(403).send({ error: "forbidden" });
    const ids = db
      .prepare("SELECT message_id AS id FROM pins WHERE channel_id = ? ORDER BY created_at DESC")
      .all(channelId)
      .map((r) => r.id);
    return { messages: ids.map((id) => messageRow(id, req.user.id)).filter(Boolean) };
  });

  app.put("/api/messages/:id/pin", async (req, reply) => {
    if (!auth(req, reply)) return;
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(req.params.id));
    if (!row || row.deleted) return reply.code(404).send({ error: "not_found" });
    const spaceId = spaceOfChannel(row.channel_id);
    if (!can(spaceId, req.user.id, "manage_messages"))
      return reply.code(403).send({ error: "forbidden" });
    const pinned = !!(req.body || {}).pinned;
    if (pinned)
      db.prepare(
        "INSERT OR REPLACE INTO pins (message_id, channel_id, pinned_by, created_at) VALUES (?, ?, ?, ?)"
      ).run(row.id, row.channel_id, req.user.id, Date.now());
    else db.prepare("DELETE FROM pins WHERE message_id = ?").run(row.id);
    hub.broadcastSpace(spaceId, { t: "message.pin", messageId: row.id, channelId: row.channel_id, pinned });
    return { pinned };
  });

  app.get("/api/spaces/:id/search", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!baseRole(spaceId, req.user.id)) return reply.code(403).send({ error: "forbidden" });
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return { messages: [] };
    const channelId = Number(req.query.channelId) || 0;
    const rows = db
      .prepare(
        `SELECT m.id FROM messages m JOIN channels c ON c.id = m.channel_id
         WHERE c.space_id = ? AND m.deleted = 0 AND m.text LIKE ?
           AND (? = 0 OR m.channel_id = ?)
         ORDER BY m.id DESC LIMIT 40`
      )
      .all(spaceId, `%${q.replace(/[%_]/g, (c) => "\\" + c)}%`, channelId, channelId);
    return { messages: rows.map((r) => messageRow(r.id, req.user.id)) };
  });

  /* ---------- files ---------- */

  const EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/zip": "zip",
  };

  app.post("/api/upload", async (req, reply) => {
    if (!auth(req, reply)) return;
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || !buffer.length) return reply.code(400).send({ error: "no_file" });
    const mime = String(req.headers["x-file-type"] || "application/octet-stream");
    const ext = EXT[mime];
    if (!ext) return reply.code(415).send({ error: "bad_type" });
    if (buffer.length > 12 * 1024 * 1024) return reply.code(413).send({ error: "too_big" });
    const name = `${randomBytes(12).toString("hex")}.${ext}`;
    writeFileSync(join(filesDir, name), buffer);
    let original = "файл";
    try {
      original = decodeURIComponent(String(req.headers["x-file-name"] || "файл"));
    } catch {
      /* имя не в utf-8 — оставим запасное */
    }
    return {
      url: `/api/files/${name}`,
      name: original.slice(0, 120),
      mime,
      size: buffer.length,
      width: Number(req.query.w) || null,
      height: Number(req.query.h) || null,
    };
  });

  app.get("/api/files/:name", async (req, reply) => {
    const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer /, "");
    if (!userByToken(token)) return reply.code(401).send({ error: "unauthorized" });
    const name = String(req.params.name || "");
    if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(name)) return reply.code(400).send({ error: "bad_name" });
    const path = join(filesDir, name);
    if (!existsSync(path)) return reply.code(404).send({ error: "not_found" });
    const ext = name.split(".").pop().toLowerCase();
    const type =
      Object.entries(EXT).find(([, value]) => value === ext)?.[0] || "application/octet-stream";
    reply.header("content-type", type);
    reply.header("cache-control", "private, max-age=31536000, immutable");
    return reply.send(createReadStream(path));
  });

  /* ---------- space ---------- */

  app.patch("/api/spaces/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!can(spaceId, req.user.id, "manage_server"))
      return reply.code(403).send({ error: "forbidden" });
    const body = req.body || {};
    const patch = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 40) return reply.code(400).send({ error: "name_length" });
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = String(body.description).slice(0, 280);
    const keys = Object.keys(patch);
    if (keys.length) {
      db.prepare(`UPDATE spaces SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
        ...keys.map((k) => patch[k]),
        spaceId
      );
    }
    const space = spacesOf(req.user.id).find((s) => s.id === spaceId);
    hub.broadcastSpace(spaceId, { t: "space.update", space });
    return { space };
  });

  app.delete("/api/spaces/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    const space = db.prepare("SELECT owner_id AS ownerId FROM spaces WHERE id = ?").get(spaceId);
    if (!space) return reply.code(404).send({ error: "not_found" });
    if (space.ownerId !== req.user.id) return reply.code(403).send({ error: "forbidden" });
    db.prepare("DELETE FROM spaces WHERE id = ?").run(spaceId);
    hub.broadcastSpace(spaceId, { t: "space.deleted", spaceId });
    return { ok: true };
  });

  /* ---------- roles ---------- */

  app.get("/api/spaces/:id/roles", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!baseRole(spaceId, req.user.id)) return reply.code(403).send({ error: "forbidden" });
    return { roles: rolesOf(spaceId) };
  });

  app.post("/api/spaces/:id/roles", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!can(spaceId, req.user.id, "manage_roles"))
      return reply.code(403).send({ error: "forbidden" });
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (name.length < 1 || name.length > 24) return reply.code(400).send({ error: "name_length" });
    const color = /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#6fe3ff";
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.filter((p) => PERMISSIONS.includes(p))
      : ["send_messages"];
    const position = Number(body.position) || rolesOf(spaceId).length;
    const info = db
      .prepare(
        "INSERT INTO roles (space_id, name, color, position, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(spaceId, name, color, position, JSON.stringify(permissions), Date.now());
    const role = parseRole(
      db
        .prepare("SELECT id, name, color, position, permissions FROM roles WHERE id = ?")
        .get(Number(info.lastInsertRowid))
    );
    hub.broadcastSpace(spaceId, { t: "roles.update", roles: rolesOf(spaceId) });
    return { role };
  });

  app.patch("/api/roles/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(Number(req.params.id));
    if (!role) return reply.code(404).send({ error: "not_found" });
    if (!can(role.space_id, req.user.id, "manage_roles"))
      return reply.code(403).send({ error: "forbidden" });
    const body = req.body || {};
    const patch = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 1 || name.length > 24) return reply.code(400).send({ error: "name_length" });
      patch.name = name;
    }
    if (body.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(body.color)) return reply.code(400).send({ error: "bad_color" });
      patch.color = body.color;
    }
    if (body.position !== undefined) patch.position = Number(body.position) || 0;
    if (body.permissions !== undefined) {
      if (!Array.isArray(body.permissions)) return reply.code(400).send({ error: "bad_permissions" });
      patch.permissions = JSON.stringify(body.permissions.filter((p) => PERMISSIONS.includes(p)));
    }
    const keys = Object.keys(patch);
    if (keys.length) {
      db.prepare(`UPDATE roles SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(
        ...keys.map((k) => patch[k]),
        role.id
      );
    }
    const updated = parseRole(
      db.prepare("SELECT id, name, color, position, permissions FROM roles WHERE id = ?").get(role.id)
    );
    hub.broadcastSpace(role.space_id, { t: "roles.update", roles: rolesOf(role.space_id) });
    return { role: updated };
  });

  app.delete("/api/roles/:id", async (req, reply) => {
    if (!auth(req, reply)) return;
    const role = db.prepare("SELECT * FROM roles WHERE id = ?").get(Number(req.params.id));
    if (!role) return reply.code(404).send({ error: "not_found" });
    if (!can(role.space_id, req.user.id, "manage_roles"))
      return reply.code(403).send({ error: "forbidden" });
    db.prepare("DELETE FROM roles WHERE id = ?").run(role.id);
    hub.broadcastSpace(role.space_id, { t: "roles.update", roles: rolesOf(role.space_id) });
    return { ok: true };
  });

  /* ---------- members ---------- */

  app.get("/api/spaces/:id/members", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!baseRole(spaceId, req.user.id)) return reply.code(403).send({ error: "forbidden" });
    return { members: membersOf(spaceId) };
  });

  app.put("/api/spaces/:id/members/:userId/roles", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!can(spaceId, req.user.id, "manage_members"))
      return reply.code(403).send({ error: "forbidden" });
    if (!baseRole(spaceId, userId)) return reply.code(404).send({ error: "not_found" });
    const ids = Array.isArray((req.body || {}).roleIds) ? req.body.roleIds.map(Number) : [];
    const valid = new Set(rolesOf(spaceId).map((r) => r.id));
    db.prepare("DELETE FROM member_roles WHERE space_id = ? AND user_id = ?").run(spaceId, userId);
    const ins = db.prepare(
      "INSERT OR IGNORE INTO member_roles (space_id, user_id, role_id) VALUES (?, ?, ?)"
    );
    for (const id of ids) if (valid.has(id)) ins.run(spaceId, userId, id);
    const member = memberOf(spaceId, userId);
    hub.broadcastSpace(spaceId, { t: "member.update", member });
    return { member };
  });

  app.delete("/api/spaces/:id/members/:userId", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!can(spaceId, req.user.id, "manage_members"))
      return reply.code(403).send({ error: "forbidden" });
    const target = baseRole(spaceId, userId);
    if (!target) return reply.code(404).send({ error: "not_found" });
    if (target === "owner") return reply.code(403).send({ error: "owner" });
    db.prepare("DELETE FROM space_members WHERE space_id = ? AND user_id = ?").run(spaceId, userId);
    db.prepare("DELETE FROM member_roles WHERE space_id = ? AND user_id = ?").run(spaceId, userId);
    hub.broadcastSpace(spaceId, { t: "member.remove", userId });
    return { ok: true };
  });

  /* ---------- invites ---------- */

  app.get("/api/spaces/:id/invites", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!can(spaceId, req.user.id, "manage_invites"))
      return reply.code(403).send({ error: "forbidden" });
    const invites = db
      .prepare(
        `SELECT i.code, i.max_uses AS maxUses, i.uses, i.expires_at AS expiresAt,
                i.revoked, i.created_at AS createdAt, u.name AS createdBy
         FROM invites i LEFT JOIN users u ON u.id = i.created_by
         WHERE i.space_id = ? ORDER BY i.created_at DESC`
      )
      .all(spaceId);
    return { invites };
  });

  app.post("/api/spaces/:id/invites", async (req, reply) => {
    if (!auth(req, reply)) return;
    const spaceId = Number(req.params.id);
    if (!can(spaceId, req.user.id, "manage_invites"))
      return reply.code(403).send({ error: "forbidden" });
    const body = req.body || {};
    const maxUses = Math.max(0, Math.min(Number(body.maxUses) || 0, 1000));
    const hours = Math.max(0, Math.min(Number(body.expiresInHours) || 0, 24 * 365));
    const code = newInvite();
    const now = Date.now();
    db.prepare(
      `INSERT INTO invites (code, space_id, created_by, max_uses, uses, expires_at, revoked, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 0, ?)`
    ).run(code, spaceId, req.user.id, maxUses, hours ? now + hours * 3600_000 : null, now);
    return { invite: inviteRow(code) };
  });

  app.delete("/api/invites/:code", async (req, reply) => {
    if (!auth(req, reply)) return;
    const inv = inviteRow(req.params.code);
    if (!inv) return reply.code(404).send({ error: "not_found" });
    if (!can(inv.spaceId, req.user.id, "manage_invites"))
      return reply.code(403).send({ error: "forbidden" });
    db.prepare("UPDATE invites SET revoked = 1 WHERE code = ?").run(inv.code);
    return { ok: true };
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
      const spaceIds = spaceIdsOf(user.id);
      if (!spaceIds.length) {
        socket.close(4003, "no_space");
        return;
      }

      hub.add(user.id, socket);
      hub.setSpaces(user.id, spaceIds);
      socket.send(JSON.stringify({ t: "ready", user: publicUser(user) }));
      broadcastPresence(user.id);

      socket.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        handleSocket(msg, user, socket).catch((error) => {
          console.error("[nexus] socket handler failed", error);
        });
      });

      socket.on("close", async () => {
        const spaceSet = hub.spacesOf(user.id);
        const gone = hub.remove(user.id, socket);
        if (gone) {
          const channelId = await voice.leave(user.id);
          if (channelId) voice.roster(channelId);
        }
        for (const spaceId of spaceSet) {
          hub.broadcastSpace(spaceId, { t: "presence", ...presenceOf(spaceId) });
        }
      });
    });
  });

  async function handleSocket(msg, user, socket) {
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
          spaceOfChannel(channelId),
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
        if (!channel || !canSeeChannel(user.id, channelId)) {
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
    const existing = db
      .prepare("SELECT code FROM invites WHERE revoked = 0 AND (expires_at IS NULL OR expires_at > ?) LIMIT 1")
      .get(Date.now());
    if (existing) return existing.code;
    const space = db.prepare("SELECT id FROM spaces ORDER BY id LIMIT 1").get();
    if (!space) return null;
    const code = newInvite();
    db.prepare(
      "INSERT INTO invites (code, space_id, created_by, max_uses, uses, expires_at, revoked, created_at) VALUES (?, ?, NULL, 0, 0, NULL, 0, ?)"
    ).run(code, space.id, Date.now());
    return code;
  });

  app.decorate("seedRoles", (spaceId) => seedRoles(db, spaceId));

  return app;
}
