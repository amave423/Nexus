import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, seed } from "../src/db.js";
import { buildApp } from "../src/app.js";

const auth = (token) => ({ authorization: `Bearer ${token}` });

async function setup(free = 20 * 1024 ** 3) {
  const db = openDb(":memory:");
  seed(db);
  const uploadDir = mkdtempSync(join(tmpdir(), "nexus-quota-test-"));
    const app = buildApp({ db, uploadDir, disk: { free: () => free } });
  const invite = app.ensureInvite();
  const reg = async (name) => (await app.inject({ method: "POST", url: "/api/auth/register", payload: { invite, name, code: "secret123" } })).json();
  const owner = await reg("Владелец");
  const member = await reg("Участник");
  const state = (await app.inject({ method: "GET", url: "/api/bootstrap", headers: auth(owner.token) })).json();
  return { app, db, uploadDir, owner, member, space: state.space, channels: state.channels };
}

async function upload(app, token, space, bytes, name = "file.png") {
  return app.inject({ method: "POST", url: `/api/upload?space=${space}`, headers: { ...auth(token), "content-type": "application/octet-stream", "x-file-type": "image/png", "x-file-name": encodeURIComponent(name) }, payload: Buffer.alloc(bytes, 1) });
}

test("channels: owner can create, rename and delete, member is refused", async () => {
  const c = await setup();
  const denied = await c.app.inject({ method:"POST", url:`/api/spaces/${c.space.id}/channels`, headers:auth(c.member.token), payload:{name:"blocked",type:"voice"} });
  assert.equal(denied.statusCode,403);
  const created = await c.app.inject({ method:"POST", url:`/api/spaces/${c.space.id}/channels`, headers:auth(c.owner.token), payload:{name:"Lobby",type:"voice"} });
  assert.equal(created.statusCode,200);
  const id = created.json().channel.id;
  assert.equal(created.json().channel.type,"voice");
  const renamed = await c.app.inject({ method:"PATCH", url:`/api/channels/${id}`, headers:auth(c.owner.token), payload:{name:"Games"} });
  assert.equal(renamed.json().channel.name,"Games");
  const deleted = await c.app.inject({ method:"DELETE", url:`/api/channels/${id}`, headers:auth(c.owner.token) });
  assert.equal(deleted.statusCode,200);
  const existing = c.db.prepare("SELECT id FROM channels WHERE id=?").get(id);
  assert.equal(existing,undefined);
  const lastId = c.db.prepare("SELECT id FROM channels WHERE space_id=? LIMIT 1").get(c.space.id).id;
  c.db.prepare("DELETE FROM channels WHERE space_id=? AND id<>? ").run(c.space.id,lastId);
  const last = await c.app.inject({ method:"DELETE", url:`/api/channels/${lastId}`, headers:auth(c.owner.token) });
  assert.equal(last.statusCode,400);
  await c.app.close(); rmSync(c.uploadDir,{recursive:true,force:true});
});

test("disk quotas: per-space allocation and oldest media reclaimed first", async () => {
  const c = await setup(10 * 1024 ** 3);
  const disk = await c.app.inject({ method:"GET",url:"/api/disk",headers:auth(c.owner.token) });
  assert.equal(disk.json().free,10 * 1024 ** 3);
  assert.equal(disk.json().allocatable,Math.floor(10 * 1024 ** 3 * 0.8));
  const created = await c.app.inject({ method:"POST",url:"/api/spaces",headers:auth(c.owner.token),payload:{name:"Quota",quotaBytes:64 * 1024 ** 2} });
  assert.equal(created.statusCode,200);
  const space = created.json().space;
  const textChannel = created.json().channels.find((x)=>x.type==="text");
  c.db.prepare("UPDATE spaces SET media_quota=? WHERE id=?").run(20 * 1024 ** 2,space.id);
  const old = await upload(c.app,c.owner.token,space.id,8 * 1024 ** 2,"old.png");
  assert.equal(old.statusCode,200);
  c.db.prepare("UPDATE media SET created_at=1 WHERE file=?").run(old.json().url.split("/").pop());
  const msg1 = await c.app.inject({method:"POST",url:`/api/channels/${textChannel.id}/messages`,headers:auth(c.owner.token),payload:{text:"old",attachments:[old.json()]}});
  assert.equal(msg1.statusCode,200);
  const recent = await upload(c.app,c.owner.token,space.id,8 * 1024 ** 2,"recent.png");
  assert.equal(recent.statusCode,200);
  const rejected = await upload(c.app,c.owner.token,space.id,8 * 1024 ** 2,"new.png");
  assert.equal(rejected.statusCode,200);
  assert.equal(existsSync(join(c.uploadDir,old.json().url.split("/").pop())),false);
  assert.equal(existsSync(join(c.uploadDir,recent.json().url.split("/").pop())),true);
  const lower = await c.app.inject({method:"PATCH",url:`/api/spaces/${space.id}`,headers:auth(c.owner.token),payload:{quotaBytes:8*1024**2}});
  assert.equal(lower.statusCode,400);
  await c.app.close(); rmSync(c.uploadDir,{recursive:true,force:true});
});

test("custom emoji: member can view but cannot manage; owner registers only own-space media", async () => {
  const c = await setup();
  const file = await upload(c.app,c.owner.token,c.space.id,1024,"face.png");
  const fileName = file.json().url.split("/").pop();
  const denied = await c.app.inject({method:"POST",url:`/api/spaces/${c.space.id}/emoji`,headers:auth(c.member.token),payload:{name:"face",file:fileName}});
  assert.equal(denied.statusCode,403);
  const add = await c.app.inject({method:"POST",url:`/api/spaces/${c.space.id}/emoji`,headers:auth(c.owner.token),payload:{name:"face",file:fileName}});
  assert.equal(add.statusCode,200);
  const list = await c.app.inject({method:"GET",url:`/api/spaces/${c.space.id}/emoji`,headers:auth(c.member.token)});
  assert.equal(list.json().emoji[0].name,"face");
  const remove = await c.app.inject({method:"DELETE",url:`/api/emoji/${add.json().emoji.id}`,headers:auth(c.owner.token)});
  assert.equal(remove.statusCode,200);
  assert.equal(existsSync(join(c.uploadDir,fileName)),false);
  await c.app.close(); rmSync(c.uploadDir,{recursive:true,force:true});
});
