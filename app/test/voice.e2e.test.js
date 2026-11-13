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
  await page.getByLabel("Пароль").fill("secret123");
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

  const noise = await pageA.evaluate(() => window.__nexusVoice.state.noise);
  assert.equal(noise, "rnnoise", "шумодав RNNoise загрузился, а не отвалился в браузерный");

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

test("голос: демонстрация экрана доходит до второго участника", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      let hue = 0;
      setInterval(() => {
        hue = (hue + 6) % 360;
        ctx.fillStyle = `hsl(${hue} 80% 50%)`;
        ctx.fillRect(0, 0, 640, 360);
      }, 100);
      return canvas.captureStream(15);
    };
  });

  await register(pageA, "Артём");
  await register(pageB, "Мира");
  await joinVoice(pageB);
  await joinVoice(pageA);
  await pageB.locator(".seat").nth(1).waitFor({ timeout: 20000 });

  await pageA.getByTitle("Демонстрация экрана").click();
  await pageB.locator(".stream-view").waitFor({ timeout: 20000 });

  const screenTracks = await pageB.evaluate(() =>
    [...document.querySelectorAll(".stream-feed video")].map((node) => ({
      tracks: node.srcObject ? node.srcObject.getVideoTracks().length : 0,
      live: node.srcObject ? node.srcObject.getVideoTracks().every((tr) => tr.readyState === "live") : false,
    }))
  );
  assert.ok(
    screenTracks.some((item) => item.tracks === 1 && item.live),
    "у Миры играет демонстрация Артёма"
  );

  const deadline = Date.now() + 20000;
  let screenBytes = 0;
  while (Date.now() < deadline) {
    const stats = await audioBytes(pageB);
    const screen = stats.find((item) => item.kind === "video" && item.source === "screen");
    if (screen && screen.bytes > 0) {
      screenBytes = screen.bytes;
      break;
    }
    await pageB.waitForTimeout(500);
  }
  assert.ok(screenBytes > 0, "пакеты демонстрации дошли до Миры");

  assert.equal(await pageB.getByText("На весь экран").count(), 1, "есть кнопка полного экрана");
  assert.equal(await pageB.locator(".stream-badge").count(), 1, "виден бейдж LIVE");

  await pageA.getByTitle("Демонстрация экрана").click();
  await pageB.locator(".stream-view").waitFor({ state: "detached", timeout: 20000 });
  assert.equal(await pageB.locator(".seat").count(), 2, "после остановки стрима комната на месте");

  await contextA.close();
  await contextB.close();
});

test("голос: звук не пропадает при переходе в текстовый канал", async (t) => {
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
  await waitForAudio(pageA, "Артёма");

  await pageA.locator(".chan", { hasText: "general" }).click();
  await pageA.getByPlaceholder("Написать в #general").waitFor({ timeout: 10000 });
  assert.equal(await pageA.locator(".room").count(), 0, "комната закрыта, открыт чат");

  const live = await pageA.evaluate(() =>
    [...document.querySelectorAll("audio")].map((node) => ({
      tracks: node.srcObject ? node.srcObject.getAudioTracks().length : 0,
      live: node.srcObject ? node.srcObject.getAudioTracks().every((tr) => tr.readyState === "live") : false,
      muted: node.muted,
    }))
  );
  assert.ok(live.some((item) => item.tracks === 1 && item.live), "звук собеседника продолжает играть в текстовом канале");

  const before = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  await pageA.waitForTimeout(2000);
  const after = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  assert.ok(after > before, `пакеты продолжают идти: было ${before}, стало ${after}`);

  await pageA.locator(".voice-seg").waitFor({ timeout: 5000 });
  await pageA.locator(".voice-seg").getByTitle("Микрофон").click();
  await pageB.locator(".seat-mute").first().waitFor({ timeout: 10000 });
  assert.equal(await pageB.locator(".seat-mute").count(), 1, "мьют из текстового канала виден в комнате");

  await pageA.locator(".voice-seg").getByTitle("Выйти из канала").click();
  await pageA.locator(".voice-seg").waitFor({ state: "detached", timeout: 10000 });
  assert.equal(await pageA.locator(".voice-seg").count(), 0, "вышел из голоса из текстового канала");

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

test("голос: без микрофона входишь в канал и слышишь остальных", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageB.addInitScript(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && constraints.audio) {
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      return real(constraints);
    };
  });

  await register(pageA, "Артём");
  await register(pageB, "Мира");

  await joinVoice(pageB);
  assert.equal(await pageB.locator(".room").count(), 1, "без микрофона в комнату всё равно пускает");
  await pageB.locator(".mic-warn").waitFor({ timeout: 15000 });

  await joinVoice(pageA);
  await pageA.locator(".seat").nth(1).waitFor({ timeout: 20000 });

  const got = await waitForAudio(pageB, "Миру");
  assert.ok(got.bytes > 0, "без микрофона Мира слышит Артёма");

  const mic = await pageB.evaluate(() => window.__nexusVoice.micInfo());
  assert.equal(mic.producer, null, "своего потока нет — микрофон недоступен");

  await contextA.close();
  await contextB.close();
});

test("голос: мьют с включённым шумодавом действительно глушит передачу", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, "Артём");
  await joinVoice(page);

  const deadline = Date.now() + 20000;
  let mic = null;
  while (Date.now() < deadline) {
    mic = await page.evaluate(() => window.__nexusVoice.micInfo());
    if (mic && mic.producer !== null) break;
    await page.waitForTimeout(300);
  }
  assert.equal(mic.noise, "rnnoise", "шумодав включён");
  assert.equal(mic.producer, true, "до мьюта дорожка передаётся");

  await page.getByTitle("Микрофон").click();
  await page.waitForTimeout(400);
  const muted = await page.evaluate(() => window.__nexusVoice.micInfo());
  assert.equal(muted.producer, false, "дорожка, которая уходит в SFU, заглушена");
  assert.deepEqual(muted.raw, [false], "сырой микрофон тоже заглушен");

  await page.getByTitle("Микрофон").click();
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => window.__nexusVoice.micInfo());
  assert.equal(back.producer, true, "после мьюта снова передаёт");
});
