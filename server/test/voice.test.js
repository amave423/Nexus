import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { openDb, seed } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { Voice } from "../src/voice.js";

let portBase = 43000;

function makeApp() {
  const db = openDb(":memory:");
  seed(db);
  const base = (portBase += 40);
  const voice = new Voice({
    announcedAddress: "127.0.0.1",
    rtcMinPort: base,
    rtcMaxPort: base + 15,
    rtcTcpMinPort: base + 20,
    rtcTcpMaxPort: base + 30,
  });
  const app = buildApp({ db, voice });
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

function channelsOf(app, token) {
  return app
    .inject({ method: "GET", url: "/api/bootstrap", headers: { authorization: `Bearer ${token}` } })
    .then((res) => res.json().channels);
}

function open(log, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${log.port}/ws?token=${token}`);
  const client = { ws, events: [], waiters: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    client.events.push(msg);
    for (const waiter of [...client.waiters]) {
      if (waiter.match(msg)) {
        client.waiters.splice(client.waiters.indexOf(waiter), 1);
        waiter.resolve(msg);
      }
    }
  });
  client.ready = new Promise((resolve, reject) => {
    ws.on("error", reject);
    client.waiters.push({ match: (m) => m.t === "ready", resolve });
  });
  client.wait = (match, ms = 4000) =>
    new Promise((resolve, reject) => {
      const found = [...client.events].reverse().find(match);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      client.waiters.push({
        match,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  client.req = (type, data = {}) => {
    const req = `${type}-${Math.random().toString(36).slice(2)}`;
    const pending = client.wait((m) => m.t === "voice.reply" && m.req === req, 8000);
    ws.send(JSON.stringify({ t: type, req, ...data }));
    return pending;
  };
  client.close = () => ws.terminate();
  return client;
}

async function listen(app) {
  await app.listen({ port: 0, host: "127.0.0.1" });
  return { port: app.server.address().port };
}

const AUDIO_RTP = {
  mid: "0",
  codecs: [
    {
      mimeType: "audio/opus",
      payloadType: 111,
      clockRate: 48000,
      channels: 2,
      parameters: { useinbandfec: 1 },
      rtcpFeedback: [],
    },
  ],
  headerExtensions: [],
  encodings: [{ ssrc: 12345678 }],
  rtcp: { cname: "test", reducedSize: true, mux: true },
};

test("голос: вход отдаёт rtpCapabilities и пустой состав", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const channels = await channelsOf(app, a.body.token);
  const voiceChannel = channels.find((c) => c.type === "voice");
  const log = await listen(app);

  const client = open(log, a.body.token);
  await client.ready;
  const reply = await client.req("voice.join", { channelId: voiceChannel.id });
  assert.equal(reply.ok, true);
  assert.equal(reply.channelId, voiceChannel.id);
  assert.ok(reply.rtpCapabilities.codecs.some((c) => c.mimeType === "audio/opus"));
  assert.deepEqual(reply.peers, []);

  const roster = await client.wait((m) => m.t === "voice.roster" && m.channelId === voiceChannel.id);
  assert.equal(roster.members.length, 1);
  assert.equal(roster.members[0].userId, a.body.user.id);

  client.close();
  await app.close();
});

test("голос: в канал чужого пространства не попасть", async () => {
  const { app, db } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");

  const otherSpace = Number(
    db.prepare("INSERT INTO spaces (name, owner_id, created_at) VALUES (?, NULL, ?)").run(
      "Чужой",
      Date.now()
    ).lastInsertRowid
  );
  db.prepare(
    "INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
  ).run(otherSpace, a.body.user.id, Date.now());
  const foreignChannel = Number(
    db
      .prepare(
        "INSERT INTO channels (space_id, name, type, topic, position) VALUES (?, ?, 'voice', '', 0)"
      )
      .run(otherSpace, "секретка").lastInsertRowid
  );

  const log = await listen(app);
  const client = open(log, a.body.token);
  await client.ready;

  const reply = await client.req("voice.join", { channelId: foreignChannel });
  assert.equal(reply.ok, undefined);
  assert.equal(reply.error, "forbidden");
  assert.equal(app.voice.channelOf(a.body.user.id), null, "в канал не пустило");

  client.close();
  await app.close();
});

test("голос: в текстовый канал не войти, без входа нет транспорта", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const channels = await channelsOf(app, a.body.token);
  const text = channels.find((c) => c.type === "text");
  const log = await listen(app);

  const client = open(log, a.body.token);
  await client.ready;

  const bad = await client.req("voice.join", { channelId: text.id });
  assert.equal(bad.error, "not_voice");

  const noJoin = await client.req("voice.createTransport", { direction: "send" });
  assert.equal(noJoin.error, "not_in_voice");

  client.close();
  await app.close();
});

test("голос: транспорт отдаёт UDP и TCP кандидатов", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const channels = await channelsOf(app, a.body.token);
  const voiceChannel = channels.find((c) => c.type === "voice");
  const log = await listen(app);

  const client = open(log, a.body.token);
  await client.ready;
  await client.req("voice.join", { channelId: voiceChannel.id });

  const transport = await client.req("voice.createTransport", { direction: "recv" });
  assert.equal(transport.ok, true);
  assert.ok(transport.id);
  assert.ok(transport.dtlsParameters.fingerprints.length > 0);
  const protocols = new Set(transport.iceCandidates.map((c) => c.protocol));
  assert.ok(protocols.has("udp"), "есть UDP-кандидат");
  assert.ok(protocols.has("tcp"), "есть TCP-кандидат — обход блокировки UDP");
  assert.equal(transport.iceCandidates[0].ip, "127.0.0.1");

  client.close();
  await app.close();
});

test("голос: SFU раздаёт поток первому слышащему и не даёт забрать свой", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const b = await register(app, invite, "Мира");
  const channels = await channelsOf(app, a.body.token);
  const voiceChannel = channels.find((c) => c.type === "voice");
  const log = await listen(app);

  const clientA = open(log, a.body.token);
  const clientB = open(log, b.body.token);
  await Promise.all([clientA.ready, clientB.ready]);

  await clientA.req("voice.join", { channelId: voiceChannel.id });
  const joinB = await clientB.req("voice.join", { channelId: voiceChannel.id });
  assert.equal(joinB.peers.length, 1);
  assert.equal(joinB.peers[0].userId, a.body.user.id);

  const sendA = await clientA.req("voice.createTransport", { direction: "send" });
  const produced = await clientA.req("voice.produce", {
    transportId: sendA.id,
    kind: "audio",
    rtpParameters: AUDIO_RTP,
    source: "camera",
  });
  assert.equal(produced.ok, true, JSON.stringify(produced));
  assert.ok(produced.id);

  const announced = await clientB.wait(
    (m) => m.t === "voice.newProducer" && m.producerId === produced.id
  );
  assert.equal(announced.userId, a.body.user.id);
  assert.equal(announced.kind, "audio");

  const recvB = await clientB.req("voice.createTransport", { direction: "recv" });
  const consumer = await clientB.req("voice.consume", {
    transportId: recvB.id,
    producerId: produced.id,
    rtpCapabilities: joinB.rtpCapabilities,
  });
  assert.equal(consumer.ok, true, JSON.stringify(consumer));
  assert.equal(consumer.kind, "audio");
  assert.equal(consumer.producerId, produced.id);
  assert.equal(consumer.userId, a.body.user.id);
  const resumed = await clientB.req("voice.resumeConsumer", { consumerId: consumer.id });
  assert.equal(resumed.ok, true);

  const own = await clientA.req("voice.consume", {
    transportId: sendA.id,
    producerId: produced.id,
    rtpCapabilities: joinB.rtpCapabilities,
  });
  assert.equal(own.error, "own_producer");

  const ghost = await clientB.req("voice.consume", {
    transportId: recvB.id,
    producerId: "00000000-0000-0000-0000-000000000000",
    rtpCapabilities: joinB.rtpCapabilities,
  });
  assert.equal(ghost.error, "no_producer");

  clientA.close();
  clientB.close();
  await app.close();
});

test("голос: дубль микрофона отклоняется, выход убирает из состава", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const b = await register(app, invite, "Мира");
  const channels = await channelsOf(app, a.body.token);
  const voiceChannel = channels.find((c) => c.type === "voice");
  const log = await listen(app);

  const clientA = open(log, a.body.token);
  const clientB = open(log, b.body.token);
  await Promise.all([clientA.ready, clientB.ready]);
  await clientA.req("voice.join", { channelId: voiceChannel.id });
  await clientB.req("voice.join", { channelId: voiceChannel.id });

  const sendA = await clientA.req("voice.createTransport", { direction: "send" });
  const first = await clientA.req("voice.produce", {
    transportId: sendA.id,
    kind: "audio",
    rtpParameters: AUDIO_RTP,
    source: "camera",
  });
  assert.equal(first.ok, true);
  const second = await clientA.req("voice.produce", {
    transportId: sendA.id,
    kind: "audio",
    rtpParameters: { ...AUDIO_RTP, mid: "1", encodings: [{ ssrc: 22334455 }] },
    source: "camera",
  });
  assert.equal(second.error, "already_producing");

  await clientA.req("voice.leave");
  const roster = await clientB.wait(
    (m) => m.t === "voice.roster" && m.channelId === voiceChannel.id && m.members.length === 1
  );
  assert.equal(roster.members[0].userId, b.body.user.id);

  clientA.close();
  clientB.close();
  await app.close();
});

test("голос: обрыв сокета выкидывает из канала", async () => {
  const { app } = makeApp();
  const invite = app.ensureInvite();
  const a = await register(app, invite, "Артём");
  const channels = await channelsOf(app, a.body.token);
  const voiceChannel = channels.find((c) => c.type === "voice");
  const log = await listen(app);

  const client = open(log, a.body.token);
  await client.ready;
  await client.req("voice.join", { channelId: voiceChannel.id });
  assert.equal(app.voice.channelOf(a.body.user.id), voiceChannel.id);

  client.close();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(app.voice.channelOf(a.body.user.id), null);
  assert.equal(app.voice.channels.size, 0, "роутер канала закрыт");

  await app.close();
});
