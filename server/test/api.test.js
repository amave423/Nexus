import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { openDb, seed } from "../src/db.js";
import { buildApp } from "../src/app.js";

function makeApp() {
  const db = openDb(":memory:");
  seed(db);
  const app = buildApp({ db });
  return { app, db };
}

async function register(app, invite, name, code = "secret123") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { invite, name, code },
  });
  return { status: res.statusCode, body: res.json() };
}

test("регистрация требует валидный инвайт", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const bad = await register(app, "nope", "Артём");
  assert.equal(bad.status, 403);
  assert.equal(bad.body.error, "invite_invalid");

  const ok = await register(app, invite, "Артём");
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.name, "Артём");
  await app.close();
});

test("имя занято, код короткий", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  await register(app, invite, "Артём");
  const dup = await register(app, invite, "артём");
  assert.equal(dup.status, 409);
  const short = await register(app, invite, "Мира", "123");
  assert.equal(short.status, 400);
  await app.close();
});

test("вход: неверный код отклоняется, верный даёт токен", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  await register(app, invite, "Артём", "secret123");

  const bad = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { name: "Артём", code: "wrong" },
  });
  assert.equal(bad.statusCode, 401);

  const ok = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { name: "Артём", code: "secret123" },
  });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().token);
  await app.close();
});

test("без токена данные не отдаются", async () => {
  const { app } = makeApp();
  const res = await app.inject({ method: "GET", url: "/api/bootstrap" });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("сообщение сохраняется и отдаётся в истории", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const { body } = await register(app, invite, "Артём");
  const headers = { authorization: `Bearer ${body.token}` };

  const boot = await app.inject({ method: "GET", url: "/api/bootstrap", headers });
  const channel = boot.json().channels.find((c) => c.type === "text");

  const sent = await app.inject({
    method: "POST",
    url: `/api/channels/${channel.id}/messages`,
    headers,
    payload: { text: "привет" },
  });
  assert.equal(sent.statusCode, 200);
  assert.equal(sent.json().message.text, "привет");

  const list = await app.inject({
    method: "GET",
    url: `/api/channels/${channel.id}/messages`,
    headers,
  });
  assert.equal(list.json().messages.length, 1);
  assert.equal(list.json().messages[0].name, "Артём");
  await app.close();
});

test("пустое сообщение не принимается", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const { body } = await register(app, invite, "Артём");
  const headers = { authorization: `Bearer ${body.token}` };
  const boot = await app.inject({ method: "GET", url: "/api/bootstrap", headers });
  const channel = boot.json().channels[0];
  const res = await app.inject({
    method: "POST",
    url: `/api/channels/${channel.id}/messages`,
    headers,
    payload: { text: "   " },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("чужой канал недоступен", async () => {
  const { app, db } = makeApp();
  const invite = app.ensureInvite();
  const { body } = await register(app, invite, "Артём");
  const headers = { authorization: `Bearer ${body.token}` };

  const now = Date.now();
  const other = db
    .prepare("INSERT INTO spaces (name, owner_id, created_at) VALUES ('Чужой', 1, ?)")
    .run(now);
  const ch = db
    .prepare("INSERT INTO channels (space_id, name, type, topic, position) VALUES (?, 'secret', 'text', '', 0)")
    .run(Number(other.lastInsertRowid));

  const res = await app.inject({
    method: "GET",
    url: `/api/channels/${Number(ch.lastInsertRowid)}/messages`,
    headers,
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test("инвайт создаёт только владелец", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const owner = await register(app, invite, "Артём");
  const guest = await register(app, invite, "Мира");

  const boot = await app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: { authorization: `Bearer ${owner.body.token}` },
  });
  const spaceId = boot.json().spaces[0].id;

  const denied = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: { authorization: `Bearer ${guest.body.token}` },
  });
  assert.equal(denied.statusCode, 403);

  const allowed = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: { authorization: `Bearer ${owner.body.token}` },
  });
  assert.equal(allowed.statusCode, 200);
  assert.ok(allowed.json().code);
  await app.close();
});

test("realtime: сообщение и набор приходят по сокету", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const b = await register(app, invite, "Мира");

  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = app.server.address().port;

  const boot = await app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: { authorization: `Bearer ${a.body.token}` },
  });
  const channel = boot.json().channels.find((c) => c.type === "text");

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${b.body.token}`);
  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${a.body.token}`);
  const events = [];
  await Promise.all([
    new Promise((resolve, reject) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        events.push(msg);
        if (msg.t === "ready") resolve();
      });
      ws.on("error", reject);
    }),
    new Promise((resolve) => wsA.on("message", (raw) => {
      if (JSON.parse(raw.toString()).t === "ready") resolve();
    })),
  ]);

  await app.inject({
    method: "POST",
    url: `/api/channels/${channel.id}/messages`,
    headers: { authorization: `Bearer ${a.body.token}` },
    payload: { text: "по сокету" },
  });

  wsA.send(JSON.stringify({ t: "typing", channelId: channel.id }));

  await new Promise((r) => setTimeout(r, 250));
  const message = events.find((e) => e.t === "message");
  assert.ok(message, "сообщение пришло по сокету");
  assert.equal(message.message.text, "по сокету");
  const typing = events.find((e) => e.t === "typing");
  assert.ok(typing, "набор пришёл по сокету");
  assert.equal(typing.name, "Артём");

  ws.terminate();
  wsA.terminate();
  await app.close();
});

test("realtime: сокет без токена закрывается", async () => {
  const { app } = makeApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = app.server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=bad`);
  const code = await new Promise((resolve) => ws.on("close", (c) => resolve(c)));
  assert.equal(code, 4001);
  await app.close();
});

test("голос: вход в канал рассылает состав", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const b = await register(app, invite, "Мира");

  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = app.server.address().port;

  const boot = await app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: { authorization: `Bearer ${a.body.token}` },
  });
  const voice = boot.json().channels.find((c) => c.type === "voice");

  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${a.body.token}`);
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${b.body.token}`);
  const eventsB = [];
  await Promise.all(
    [wsA, wsB].map(
      (ws) =>
        new Promise((resolve) => {
          ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            if (ws === wsB) eventsB.push(msg);
            if (msg.t === "ready") resolve();
          });
        })
    )
  );

  wsA.send(JSON.stringify({ t: "voice.join", channelId: voice.id, muted: false }));
  await new Promise((r) => setTimeout(r, 250));

  const roster = eventsB.filter((e) => e.t === "voice.roster").pop();
  assert.ok(roster, "состав голосового канала пришёл");
  assert.equal(roster.channelId, voice.id);
  assert.equal(roster.members.length, 1);
  assert.equal(roster.members[0].userId, a.body.user.id);

  wsA.terminate();
  wsB.terminate();
  await app.close();
});
