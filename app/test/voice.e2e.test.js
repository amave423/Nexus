import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer as bootServer, stopServer } from "./helpers.js";

const FAKE_MEDIA = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

let harness;
let base;
let invite;

async function startServer(opts) {
  harness = await bootServer({
    prefix: "nexus-voice-",
    portBase: 8700,
    timeout: 25000,
    env: { NEXUS_RTC_ANNOUNCED: "127.0.0.1" },
    ...opts,
  });
  base = harness.base;
  invite = harness.invite;
}

async function stopAll(browser) {
  await browser.close();
  await stopServer(harness);
}

async function register(page, name) {
  await page.goto(`${base}/?server=${encodeURIComponent(harness.apiBase)}`);
  await page.getByRole("button", { name: "У меня инвайт" }).click();
  await page.getByLabel("Код приглашения").fill(invite);
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Код доступа").fill("secret123");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.locator(".chan").first().waitFor();
}

async function joinVoice(page) {
  await page.locator(".chan", { hasText: "Кухня" }).click();
  await page.locator(".room").waitFor({ timeout: 20000 });
}

async function audioBytes(page) {
  return page.evaluate(async () => {
    const voice = window.__nexusVoice;
    if (!voice) return [];
    return voice.stats();
  });
}

async function voiceDebug(page) {
  return page.evaluate(() => {
    const voice = window.__nexusVoice;
    if (!voice) return "нет клиента голоса";
    return JSON.stringify({
      state: {
        channelId: voice.state.channelId,
        joined: voice.state.joined,
        joining: voice.state.joining,
        error: voice.state.error,
        muted: voice.state.muted,
      },
      audio: [...document.querySelectorAll("audio")].map((n) => (n.srcObject ? n.srcObject.getAudioTracks().length : -1)),
    });
  });
}

async function waitForAudio(page, label) {
  const deadline = Date.now() + 30000;
  let last = [];
  while (Date.now() < deadline) {
    last = await audioBytes(page);
    const received = last.find((item) => item.kind === "audio" && item.bytes > 0);
    if (received) return received;
    await page.waitForTimeout(500);
  }
  const infoA = await voiceDebug(page);
  assert.fail(`звук не дошёл до ${label}: ${JSON.stringify(last)} / ${infoA}`);
}

test("голос: два клиента слышат друг друга в канале", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await register(pageA, "Артём");
  await register(pageB, "Мира");

  await joinVoice(pageB);
  await joinVoice(pageA);

  await pageA.locator(".seat").nth(1).waitFor({ timeout: 20000 });
  await pageB.locator(".seat").nth(1).waitFor({ timeout: 20000 });
  assert.equal(await pageA.locator(".seat").count(), 2, "в комнате Артёма двое");
  assert.equal(await pageB.locator(".seat").count(), 2, "в комнате Миры двое");

  const gotA = await waitForAudio(pageA, "Артёма");
  const gotB = await waitForAudio(pageB, "Миру");
  assert.equal(gotA.kind, "audio");
  assert.equal(gotB.kind, "audio");
  assert.ok(gotA.bytes > 0 && gotB.bytes > 0, "обе стороны приняли пакеты");

  const liveTracks = await pageA.evaluate(() =>
    [...document.querySelectorAll("audio")].map((node) => ({
      tracks: node.srcObject ? node.srcObject.getAudioTracks().length : 0,
      live: node.srcObject ? node.srcObject.getAudioTracks().every((tr) => tr.readyState === "live") : false,
    }))
  );
  assert.ok(liveTracks.some((item) => item.tracks === 1 && item.live), "звук собеседника играет");

  await pageA.getByTitle("Микрофон").click();
  await pageB.locator(".seat-mute").first().waitFor({ timeout: 10000 });
  assert.equal(await pageB.locator(".seat-mute").count(), 1, "у Миры видно, что Артём замьючен");

  await pageA.getByTitle("Камера").click();
  await pageB.locator(".cams .cam").first().waitFor({ timeout: 20000 });
  const camTracks = await pageB.evaluate(() =>
    [...document.querySelectorAll(".cams video")].filter(
      (node) => node.srcObject && node.srcObject.getVideoTracks().length > 0
    ).length
  );
  assert.ok(camTracks >= 1, "камера Артёма видна у Миры");

  await pageA.locator(".rbtn.leave").click();
  await pageB.locator(".seat").nth(1).waitFor({ state: "detached", timeout: 20000 });
  assert.equal(await pageB.locator(".seat").count(), 1, "после выхода остался один");

  await contextA.close();
  await contextB.close();
});

test("голос: в текстовый канал не входит, комната не открывается", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, "Артём");
  await page.locator(".chan", { hasText: "general" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".room").count(), 0, "в текстовом канале комнаты нет");
  assert.equal(await page.getByPlaceholder("Написать в #general").count(), 1, "чат на месте");
});
