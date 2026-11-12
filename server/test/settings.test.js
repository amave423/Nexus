import test from "node:test";
import assert from "node:assert/strict";
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

async function setup() {
  const { app, db } = makeApp();
  const invite = app.ensureInvite();
  const owner = await register(app, invite, "Артём");
  const guest = await register(app, invite, "Мира");
  const headers = (who) => ({ authorization: `Bearer ${who.body.token}` });
  const boot = await app.inject({ method: "GET", url: "/api/bootstrap", headers: headers(owner) });
  const spaceId = boot.json().space.id;
  return { app, db, invite, owner, guest, headers, spaceId, boot: boot.json() };
}

test("bootstrap отдаёт пространство, роли и права", async () => {
  const { app, boot } = await setup();
  assert.ok(boot.space.id);
  assert.equal(boot.space.name, "Nexus");
  assert.equal(boot.roles.length, 3);
  assert.ok(boot.permissions.includes("manage_server"));
  assert.ok(boot.members.every((m) => Array.isArray(m.roles)));
  await app.close();
});

test("профиль: имя, о себе, статус и аватар сохраняются", async () => {
  const { app, headers, owner } = await setup();
  const avatar = "data:image/png;base64,iVBORw0KGgo=";
  const res = await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: headers(owner),
    payload: { name: "Артём К", about: "делаю nexus", status: "dnd", avatar },
  });
  assert.equal(res.statusCode, 200);
  const user = res.json().user;
  assert.equal(user.name, "Артём К");
  assert.equal(user.about, "делаю nexus");
  assert.equal(user.status, "dnd");
  assert.equal(user.avatar, avatar);

  const me = await app.inject({ method: "GET", url: "/api/me", headers: headers(owner) });
  assert.equal(me.json().user.name, "Артём К");
  await app.close();
});

test("профиль: чужое имя, плохой статус и не картинка отклоняются", async () => {
  const { app, headers, owner } = await setup();
  const taken = await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: headers(owner),
    payload: { name: "Мира" },
  });
  assert.equal(taken.statusCode, 409);

  const status = await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: headers(owner),
    payload: { status: "сплю" },
  });
  assert.equal(status.statusCode, 400);

  const avatar = await app.inject({
    method: "PATCH",
    url: "/api/me",
    headers: headers(owner),
    payload: { avatar: "javascript:alert(1)" },
  });
  assert.equal(avatar.statusCode, 400);
  await app.close();
});

test("роли: создаёт владелец, участник получает отказ", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const denied = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/roles`,
    headers: headers(guest),
    payload: { name: "Хакер", color: "#ff0000" },
  });
  assert.equal(denied.statusCode, 403);

  const created = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/roles`,
    headers: headers(owner),
    payload: { name: "Дизайнер", color: "#ff6b8a", permissions: ["send_messages"] },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().role.name, "Дизайнер");
  assert.equal(created.json().role.color, "#ff6b8a");

  const list = await app.inject({
    method: "GET",
    url: `/api/spaces/${spaceId}/roles`,
    headers: headers(guest),
  });
  assert.equal(list.json().roles.length, 4);
  await app.close();
});

test("роль даёт право: участник с manage_invites создаёт приглашение", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const role = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/roles`,
    headers: headers(owner),
    payload: { name: "Модератор", color: "#6fe3ff", permissions: ["manage_invites"] },
  });
  const roleId = role.json().role.id;

  const before = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(guest),
  });
  assert.equal(before.statusCode, 403);

  const assigned = await app.inject({
    method: "PUT",
    url: `/api/spaces/${spaceId}/members/${guest.body.user.id}/roles`,
    headers: headers(owner),
    payload: { roleIds: [roleId] },
  });
  assert.equal(assigned.statusCode, 200);
  assert.equal(assigned.json().member.roles[0].name, "Модератор");

  const after = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(guest),
  });
  assert.equal(after.statusCode, 200);
  await app.close();
});

test("роль удаляется и права пропадают", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const role = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/roles`,
    headers: headers(owner),
    payload: { name: "Модератор", permissions: ["manage_invites"] },
  });
  const roleId = role.json().role.id;
  await app.inject({
    method: "PUT",
    url: `/api/spaces/${spaceId}/members/${guest.body.user.id}/roles`,
    headers: headers(owner),
    payload: { roleIds: [roleId] },
  });

  const removed = await app.inject({
    method: "DELETE",
    url: `/api/roles/${roleId}`,
    headers: headers(owner),
  });
  assert.equal(removed.statusCode, 200);

  const denied = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(guest),
  });
  assert.equal(denied.statusCode, 403);
  await app.close();
});

test("приглашения: список, лимит входов и отзыв", async () => {
  const { app, headers, owner, spaceId } = await setup();
  const created = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(owner),
    payload: { maxUses: 1 },
  });
  assert.equal(created.statusCode, 200);
  const code = created.json().invite.code;

  const list = await app.inject({
    method: "GET",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(owner),
  });
  assert.ok(list.json().invites.some((i) => i.code === code));

  const first = await register(app, code, "Первый");
  assert.equal(first.status, 200);
  const second = await register(app, code, "Второй");
  assert.equal(second.status, 403);

  const fresh = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(owner),
  });
  const freshCode = fresh.json().invite.code;
  const revoked = await app.inject({
    method: "DELETE",
    url: `/api/invites/${freshCode}`,
    headers: headers(owner),
  });
  assert.equal(revoked.statusCode, 200);
  const blocked = await register(app, freshCode, "Третий");
  assert.equal(blocked.status, 403);
  await app.close();
});

test("приглашения: чужой не видит и не отзывает", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const created = await app.inject({
    method: "POST",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(owner),
  });
  const code = created.json().invite.code;

  const list = await app.inject({
    method: "GET",
    url: `/api/spaces/${spaceId}/invites`,
    headers: headers(guest),
  });
  assert.equal(list.statusCode, 403);

  const revoke = await app.inject({
    method: "DELETE",
    url: `/api/invites/${code}`,
    headers: headers(guest),
  });
  assert.equal(revoke.statusCode, 403);
  await app.close();
});

test("участники: список с ролями, кик, владельца не кикнуть", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const list = await app.inject({
    method: "GET",
    url: `/api/spaces/${spaceId}/members`,
    headers: headers(guest),
  });
  assert.equal(list.json().members.length, 2);

  const kickOwner = await app.inject({
    method: "DELETE",
    url: `/api/spaces/${spaceId}/members/${owner.body.user.id}`,
    headers: headers(owner),
  });
  assert.equal(kickOwner.statusCode, 403);

  const kickGuest = await app.inject({
    method: "DELETE",
    url: `/api/spaces/${spaceId}/members/${guest.body.user.id}`,
    headers: headers(owner),
  });
  assert.equal(kickGuest.statusCode, 200);

  const after = await app.inject({
    method: "GET",
    url: `/api/spaces/${spaceId}/members`,
    headers: headers(owner),
  });
  assert.equal(after.json().members.length, 1);
  await app.close();
});

test("название сервера меняет только владелец, удаляет только он же", async () => {
  const { app, headers, owner, guest, spaceId } = await setup();
  const denied = await app.inject({
    method: "PATCH",
    url: `/api/spaces/${spaceId}`,
    headers: headers(guest),
    payload: { name: "Захват" },
  });
  assert.equal(denied.statusCode, 403);

  const renamed = await app.inject({
    method: "PATCH",
    url: `/api/spaces/${spaceId}`,
    headers: headers(owner),
    payload: { name: "Кухня", description: "для своих" },
  });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.json().space.name, "Кухня");

  const deniedDelete = await app.inject({
    method: "DELETE",
    url: `/api/spaces/${spaceId}`,
    headers: headers(guest),
  });
  assert.equal(deniedDelete.statusCode, 403);

  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/spaces/${spaceId}`,
    headers: headers(owner),
  });
  assert.equal(deleted.statusCode, 200);
  await app.close();
});
