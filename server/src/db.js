import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  name_lc    TEXT NOT NULL UNIQUE,
  code_hash  TEXT NOT NULL,
  code_salt  TEXT NOT NULL,
  avatar     TEXT,
  color      TEXT,
  about      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'online',
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER REFERENCES users(id),
  media_quota INTEGER NOT NULL DEFAULT 1073741824,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_roles (
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id  INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text',
  topic      TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL UNIQUE,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_space_age ON media(space_id, created_at, id);

CREATE TABLE IF NOT EXISTS custom_emoji (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(space_id, name)
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS pins (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pinned_by  INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id),
  max_uses   INTEGER NOT NULL DEFAULT 0,
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`;

const COLUMNS = [
  ["users", "about", "TEXT NOT NULL DEFAULT ''"],
  ["users", "status", "TEXT NOT NULL DEFAULT 'online'"],
  ["spaces", "media_quota", "INTEGER NOT NULL DEFAULT 1073741824"],
  ["invites", "expires_at", "INTEGER"],
  ["invites", "revoked", "INTEGER NOT NULL DEFAULT 0"],
  ["messages", "reply_to", "INTEGER"],
  ["messages", "edited_at", "INTEGER"],
  ["messages", "deleted", "INTEGER NOT NULL DEFAULT 0"],
];

function migrate(db) {
  for (const [table, column, ddl] of COLUMNS) {
    const exists = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function openDb(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export const DEFAULT_ROLES = [
  { name: "Владелец", color: "#c8ff3d", permissions: ["manage_server", "manage_roles", "manage_members", "manage_invites", "send_messages"] },
  { name: "Админ", color: "#b18cff", permissions: ["manage_roles", "manage_members", "manage_invites", "send_messages"] },
  { name: "Участник", color: "#6fe3ff", permissions: ["send_messages"] },
];

export function repairOwners(db) {
  const orphans = db.prepare("SELECT id FROM spaces WHERE owner_id IS NULL").all();
  for (const space of orphans) {
    const first = db
      .prepare("SELECT user_id AS id FROM space_members WHERE space_id = ? ORDER BY joined_at, user_id LIMIT 1")
      .get(space.id);
    if (!first) continue;
    db.prepare("UPDATE spaces SET owner_id = ? WHERE id = ?").run(first.id, space.id);
    db.prepare("UPDATE space_members SET role = 'owner' WHERE space_id = ? AND user_id = ?").run(space.id, first.id);
  }
}

export function assignRole(db, spaceId, userId, roleName) {
  const role = db.prepare("SELECT id FROM roles WHERE space_id = ? AND name = ?").get(spaceId, roleName);
  if (!role) return;
  db.prepare("INSERT OR IGNORE INTO member_roles (space_id, user_id, role_id) VALUES (?, ?, ?)").run(
    spaceId,
    userId,
    role.id
  );
}

export function repairRoles(db) {
  const rows = db
    .prepare(
      `SELECT sm.space_id AS spaceId, sm.user_id AS userId, s.owner_id AS ownerId
         FROM space_members sm
         JOIN spaces s ON s.id = sm.space_id
        WHERE NOT EXISTS (
          SELECT 1 FROM member_roles mr WHERE mr.space_id = sm.space_id AND mr.user_id = sm.user_id
        )`
    )
    .all();
  for (const row of rows) {
    assignRole(db, row.spaceId, row.userId, row.userId === row.ownerId ? "Владелец" : "Участник");
  }
  return rows.length;
}

export function seedRoles(db, spaceId) {
  const now = Date.now();
  const ins = db.prepare(
    "INSERT INTO roles (space_id, name, color, position, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  return DEFAULT_ROLES.map((role, i) =>
    Number(ins.run(spaceId, role.name, role.color, i, JSON.stringify(role.permissions), now).lastInsertRowid)
  );
}

export function seed(db, { spaceName = "Nexus", channels = ["general", "дизайн", "мемы"] } = {}) {
  const now = Date.now();
  const space = db
    .prepare("INSERT INTO spaces (name, description, owner_id, created_at) VALUES (?, ?, NULL, ?)")
    .run(spaceName, "Голосовая комната для своих.", now);
  const spaceId = Number(space.lastInsertRowid);
  const ins = db.prepare(
    "INSERT INTO channels (space_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?)"
  );
  channels.forEach((name, i) => ins.run(spaceId, name, "text", "", i));
  ins.run(spaceId, "Кухня", "voice", "", channels.length);
  ins.run(spaceId, "Игровая", "voice", "", channels.length + 1);
  seedRoles(db, spaceId);
  return spaceId;
}
