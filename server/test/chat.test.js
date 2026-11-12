import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, seed } from "../src/db.js";
import { buildApp } from "../src/app.js";

function makeApp() {
  const db = openDb(":memory:");
  seed(db);
  const uploadDir = mkdtempSync(join(tmpdir(), "nexus-files-"));
  const app = buildApp({ db, uploadDir });
  return { app, db, uploadDir };
}

async function register(app, invite, name, code = "secret123") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { invite, name, code },
  });
  return res.json();
}

const auth = (token) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const ctx = makeApp();
  const invite = ctx.app.ensureInvite();
  const owner = await register(ctx.app, invite, "Артём");
  const guest = await register(ctx.app, invite, "Мира");
  const state = await ctx.app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: auth(owner.token),
  });
  const channel = state.json().channels.find((c) => c.type === "text");
  return { ...ctx, owner, guest, channel };
}

async function send(app, token, channelId, payload) {
  const res = await app.inject({
    method: "POST",
    url: `/api/channels/${channelId}/messages`,
    headers: auth(token),
    payload,
  });
  return { status: res.statusCode, body: res.json() };
}

test("чат: ответ на сообщение приходит с цитатой", async () => {
  const { app, owner, guest, channel } = await setup();
  const first = await send(app, owner.token, channel.id, { text: "кто идёт в голос?" });
  const reply = await send(app, guest.token, channel.id, {
    text: "я",
    replyTo: first.body.message.id,
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.message.reply.id, first.body.message.id);
  assert.equal(reply.body.message.reply.name, "Артём");
  assert.equal(reply.body.message.reply.text, "кто идёт в голос?");
  await app.close();
});

test("чат: ответ на сообщение из другого канала не прикрепляется", async () => {
  const { app, owner, guest, channel } = await setup();
  const other = await app.inject({
    method: "POST",
    url: `/api/spaces/${channel.space_id || 1}/channels`,
    headers: auth(owner.token),
    payload: { name: "другой", type: "text" },
  });
  const otherId = other.json().channel?.id;
  if (!otherId) return app.close();
  const first = await send(app, owner.token, otherId, { text: "там" });
  const reply = await send(app, guest.token, channel.id, {
    text: "тут",
    replyTo: first.body.message.id,
  });
  assert.equal(reply.body.message.reply, null);
  await app.close();
});

test("чат: автор правит своё, чужой получает отказ", async () => {
  const { app, owner, guest, channel } = await setup();
  const created = await send(app, owner.token, channel.id, { text: "черновик" });
  const id = created.body.message.id;

  const foreign = await app.inject({
    method: "PATCH",
    url: `/api/messages/${id}`,
    headers: auth(guest.token),
    payload: { text: "подменил" },
  });
  assert.equal(foreign.statusCode, 403);

  const own = await app.inject({
    method: "PATCH",
    url: `/api/messages/${id}`,
    headers: auth(owner.token),
    payload: { text: "готово" },
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().message.text, "готово");
  assert.ok(own.json().message.editedAt);
  await app.close();
});

test("чат: удалить может автор, чужой — нет; текст пропадает", async () => {
  const { app, owner, guest, channel } = await setup();
  const created = await send(app, owner.token, channel.id, { text: "убери" });
  const id = created.body.message.id;

  const foreign = await app.inject({
    method: "DELETE",
    url: `/api/messages/${id}`,
    headers: auth(guest.token),
  });
  assert.equal(foreign.statusCode, 403);

  const own = await app.inject({
    method: "DELETE",
    url: `/api/messages/${id}`,
    headers: auth(owner.token),
  });
  assert.equal(own.statusCode, 200);

  const list = await app.inject({
    method: "GET",
    url: `/api/channels/${channel.id}/messages`,
    headers: auth(guest.token),
  });
  const message = list.json().messages.find((m) => m.id === id);
  assert.equal(message.deleted, true);
  assert.equal(message.text, "");
  await app.close();
});

test("чат: реакция ставится и снимается, счётчик общий", async () => {
  const { app, owner, guest, channel } = await setup();
  const created = await send(app, owner.token, channel.id, { text: "огонь" });
  const id = created.body.message.id;

  const put = (token) =>
    app.inject({
      method: "PUT",
      url: `/api/messages/${id}/reactions`,
      headers: auth(token),
      payload: { emoji: "🔥" },
    });

  const one = await put(owner.token);
  assert.deepEqual(one.json().reactions, [{ emoji: "🔥", count: 1, mine: true }]);

  const two = await put(guest.token);
  assert.equal(two.json().reactions[0].count, 2);

  const off = await put(guest.token);
  assert.equal(off.json().reactions[0].count, 1);
  assert.equal(off.json().reactions[0].mine, false);
  await app.close();
});

test("чат: закрепить может только с правом, список закреплённых отдаётся", async () => {
  const { app, owner, guest, channel } = await setup();
  const created = await send(app, owner.token, channel.id, { text: "важное" });
  const id = created.body.message.id;

  const denied = await app.inject({
    method: "PUT",
    url: `/api/messages/${id}/pin`,
    headers: auth(guest.token),
    payload: { pinned: true },
  });
  assert.equal(denied.statusCode, 403);

  const ok = await app.inject({
    method: "PUT",
    url: `/api/messages/${id}/pin`,
    headers: auth(owner.token),
    payload: { pinned: true },
  });
  assert.equal(ok.statusCode, 200);

  const pins = await app.inject({
    method: "GET",
    url: `/api/channels/${channel.id}/pins`,
    headers: auth(guest.token),
  });
  assert.equal(pins.json().messages.length, 1);
  assert.equal(pins.json().messages[0].id, id);
  await app.close();
});

test("чат: поиск находит по тексту и не отдаёт чужой сервер", async () => {
  const { app, owner, guest, channel } = await setup();
  await send(app, owner.token, channel.id, { text: "секретная встреча в пятницу" });

  const found = await app.inject({
    method: "GET",
    url: `/api/spaces/1/search?q=встреча`,
    headers: auth(guest.token),
  });
  assert.equal(found.statusCode, 200);
  assert.equal(found.json().messages.length, 1);

  const other = await app.inject({
    method: "POST",
    url: "/api/spaces",
    headers: auth(owner.token),
    payload: { name: "Чужой" },
  });
  const otherId = other.json().space.id;
  const denied = await app.inject({
    method: "GET",
    url: `/api/spaces/${otherId}/search?q=встреча`,
    headers: auth(guest.token),
  });
  assert.equal(denied.statusCode, 403);
  await app.close();
});

test("чат: вложение загружается, прикрепляется и отдаётся по токену", async () => {
  const { app, owner, guest, channel, uploadDir } = await setup();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  const upload = await app.inject({
    method: "POST",
    url: "/api/upload?w=1&h=1",
    headers: {
      ...auth(owner.token),
      "content-type": "application/octet-stream",
      "x-file-type": "image/png",
      "x-file-name": encodeURIComponent("pixel.png"),
    },
    payload: png,
  });
  assert.equal(upload.statusCode, 200);
  const file = upload.json();
  assert.match(file.url, /^\/api\/files\/[a-z0-9]+\.png$/);
  assert.equal(file.width, 1);

  const created = await send(app, owner.token, channel.id, {
    text: "",
    attachments: [file],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.message.attachments.length, 1);
  assert.equal(created.body.message.attachments[0].mime, "image/png");

  const noToken = await app.inject({ method: "GET", url: file.url });
  assert.equal(noToken.statusCode, 401);

  const withToken = await app.inject({
    method: "GET",
    url: `${file.url}?token=${guest.token}`,
  });
  assert.equal(withToken.statusCode, 200);
  assert.equal(withToken.headers["content-type"], "image/png");
  assert.equal(withToken.rawPayload.length, png.length);

  rmSync(uploadDir, { recursive: true, force: true });
  await app.close();
});

test("чат: пустое сообщение без вложений отклоняется", async () => {
  const { app, owner, channel } = await setup();
  const empty = await send(app, owner.token, channel.id, { text: "   " });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, "empty");
  await app.close();
});

test("чат: в чужой канал писать нельзя", async () => {
  const { app, owner, guest } = await setup();
  const other = await app.inject({
    method: "POST",
    url: "/api/spaces",
    headers: auth(owner.token),
    payload: { name: "Закрытый" },
  });
  const foreignChannel = other.json().channels.find((c) => c.type === "text");
  const denied = await send(app, guest.token, foreignChannel.id, { text: "пустите" });
  assert.equal(denied.status, 403);
  await app.close();
});
