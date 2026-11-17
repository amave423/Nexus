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

  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });
  await pageB.locator(".node").nth(1).waitFor({ timeout: 20000 });
  assert.equal(await pageA.locator(".node").count(), 2, "в комнате Артёма двое");
  assert.equal(await pageB.locator(".node").count(), 2, "в комнате Миры двое");

  const gotA = await waitForAudio(pageA, "Артёма");
  const gotB = await waitForAudio(pageB, "Миру");
  assert.equal(gotA.kind, "audio");
  assert.equal(gotB.kind, "audio");
  assert.ok(gotA.bytes > 0 && gotB.bytes > 0, "обе стороны приняли пакеты");

  const noise = await pageA.evaluate(() => window.__nexusVoice.state.noise);
  assert.equal(noise, "rnnoise", "шумодав RNNoise загрузился, а не отвалился в браузерный");

  const routed = await pageA.evaluate(() => window.__nexusVoice.audioDebug());
  assert.ok(routed.some((item) => (item.gain ?? item.volume) > 0), "звук собеседника играет");

  await pageA.locator(".room").getByTitle("Микрофон").click();
  await pageB.locator(".node-mute").first().waitFor({ timeout: 10000 });
  assert.equal(await pageB.locator(".node-mute").count(), 1, "у Миры видно, что Артём замьючен");

  await pageA.locator(".room").getByTitle("Камера").click();
  await pageB.locator(".cams .cam").first().waitFor({ timeout: 20000 });
  const camTracks = await pageB.evaluate(() =>
    [...document.querySelectorAll(".cams video")].filter(
      (node) => node.srcObject && node.srcObject.getVideoTracks().length > 0
    ).length
  );
  assert.ok(camTracks >= 1, "камера Артёма видна у Миры");

  await pageA.locator(".rbtn.leave").click();
  await pageB.locator(".node").nth(1).waitFor({ state: "detached", timeout: 20000 });
  assert.equal(await pageB.locator(".node").count(), 1, "после выхода остался один");

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
  await pageB.locator(".node").nth(1).waitFor({ timeout: 20000 });

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
  assert.equal(await pageB.locator(".node").count(), 2, "после остановки стрима комната на месте");

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
  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });
  await waitForAudio(pageA, "Артёма");

  await pageA.locator(".chan", { hasText: "general" }).click();
  await pageA.getByPlaceholder("Написать в #general").waitFor({ timeout: 10000 });
  assert.equal(await pageA.locator(".room").count(), 0, "комната закрыта, открыт чат");

  const live = await pageA.evaluate(() => window.__nexusVoice.audioDebug());
  assert.ok(
    live.length > 0 && live.some((item) => (item.gain ?? item.volume) > 0),
    "звук собеседника продолжает играть в текстовом канале"
  );

  const before = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  await pageA.waitForTimeout(2000);
  const after = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  assert.ok(after > before, `пакеты продолжают идти: было ${before}, стало ${after}`);

  await pageA.locator(".voice-seg").waitFor({ timeout: 5000 });
  await pageA.locator(".voice-seg").getByTitle("Микрофон").click();
  await pageB.locator(".node-mute").first().waitFor({ timeout: 10000 });
  assert.equal(await pageB.locator(".node-mute").count(), 1, "мьют из текстового канала виден в комнате");

  await pageA.locator(".voice-seg").getByTitle("Выйти из канала").click();
  await pageA.locator(".voice-seg").waitFor({ state: "detached", timeout: 10000 });
  assert.equal(await pageA.locator(".voice-seg").count(), 0, "панель голоса убрана, когда вышел из канала");

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
  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });

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

  await page.locator(".room").getByTitle("Микрофон").click();
  await page.waitForTimeout(400);
  const muted = await page.evaluate(() => window.__nexusVoice.micInfo());
  assert.equal(muted.producer, false, "дорожка, которая уходит в SFU, заглушена");
  assert.deepEqual(muted.raw, [false], "сырой микрофон тоже заглушен");

  await page.locator(".room").getByTitle("Микрофон").click();
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => window.__nexusVoice.micInfo());
  assert.equal(back.producer, true, "после мьюта снова передаёт");
});

test("голос: проверка микрофона в настройках не глушит активный канал", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await register(page, "Артём");
  await joinVoice(page);
  await page.locator(".node").first().waitFor({ timeout: 20000 });

  const before = await page.evaluate(() => ({ muted: window.__nexusVoice.state.muted, error: window.__nexusVoice.state.micError }));
  assert.equal(before.muted, false, "канал начался с включённым микрофоном");

  await page.locator(".profile-btn").click();
  await page.getByRole("button", { name: "Голос и видео" }).click();
  const pane = page.getByRole("dialog");
  await pane.getByRole("button", { name: "Проверить" }).click();
  await page.locator(".vtest.live").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await pane.getByRole("button", { name: "Закрыть" }).click();
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => ({
    muted: window.__nexusVoice.state.muted,
    error: window.__nexusVoice.state.micError,
    track: window.__nexusVoice.micTrack() ? window.__nexusVoice.micTrack().readyState : "none",
  }));
  assert.equal(after.muted, false, "после проверки микрофон остался включённым");
  assert.equal(after.error, null, "после проверки нет ошибки микрофона");
  assert.equal(after.track, "live", "дорожка микрофона жива");
  assert.equal(await page.locator(".mic-warn").count(), 0, "нет плашки «Микрофон недоступен»");

  const profile = await page.evaluate(() => window.__nexusVoice.state.micError);
  assert.equal(profile, null);

  await context.close();
});

test("голос: смена шумодава в канале не ломает микрофон", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext({ permissions: ["microphone"] });
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await register(pageA, "Артём");
  await register(pageB, "Мира");
  await joinVoice(pageB);
  await joinVoice(pageA);
  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });
  await waitForAudio(pageB, "Артёма");

  await pageA.locator(".profile-btn").click();
  await pageA.getByRole("button", { name: "Голос и видео" }).click();
  const pane = pageA.getByRole("dialog");

  for (const label of ["Браузерный · лёгкий", "Выключен", "RNNoise · сильный"]) {
    await pane.locator(".dd.open").count();
    await pane.locator(".dd-btn", { hasText: /RNNoise|Браузерный|Выключен/ }).first().click();
    await pageA.locator(".dd-opt", { hasText: label }).first().click();
    await pageA.waitForTimeout(1500);
    const mic = await pageA.evaluate(() => ({
      error: window.__nexusVoice.state.micError,
      track: window.__nexusVoice.micTrack() ? window.__nexusVoice.micTrack().readyState : "none",
    }));
    assert.equal(mic.error, null, `шумодав «${label}»: ошибки микрофона нет`);
    assert.equal(mic.track, "live", `шумодав «${label}»: дорожка жива`);
  }

  await pane.getByRole("button", { name: "Закрыть" }).click();
  const before = (await audioBytes(pageB)).find((item) => item.kind === "audio")?.bytes || 0;
  await pageB.waitForTimeout(2500);
  const after = (await audioBytes(pageB)).find((item) => item.kind === "audio")?.bytes || 0;
  assert.ok(after > before, `после смены шумодава голос доходит: было ${before}, стало ${after}`);

  await contextA.close();
  await contextB.close();
});

test("голос: переход на другой сервер не выкидывает из канала", async (t) => {
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
  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });
  await waitForAudio(pageA, "Артёма");

  await pageA.getByRole("button", { name: "Новый сервер" }).click();
  await pageA.getByPlaceholder("Название сервера").fill("Вторая");
  await pageA.getByRole("button", { name: "Создать сервер" }).click();
  await pageA.getByPlaceholder("Написать в #general").waitFor({ timeout: 10000 });

  assert.equal(await pageA.locator(".voice-seg").getByTitle("Выйти из канала").count(), 1,
    "консоль голоса осталась: из канала не выкинуло");
  assert.match(await pageA.locator(".voice-seg .nm").textContent(), /Кухня/, "видно, в каком канале сидишь");

  const before = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  await pageA.waitForTimeout(2000);
  const after = (await audioBytes(pageA)).find((item) => item.kind === "audio")?.bytes || 0;
  assert.ok(after > before, `звук продолжает идти: было ${before}, стало ${after}`);

  assert.equal(await pageB.locator(".node").count(), 2, "на первом сервере собеседник остался в канале");

  await pageA.locator(".coin").first().click();
  await pageA.getByPlaceholder("Написать в #general").waitFor({ timeout: 10000 });
  assert.equal(await pageA.locator(".voice-seg").getByTitle("Выйти из канала").count(), 1,
    "после возврата на первый сервер всё ещё в голосе");

  await contextA.close();
  await contextB.close();
});

test("голос: меню участника даёт громкость до 200% и личный мьют", async (t) => {
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
  await pageA.locator(".node").nth(1).waitFor({ timeout: 20000 });

  await pageA.locator('.node[title="Мира"]').click({ button: "right" });
  const menu = pageA.locator(".umenu");
  await menu.waitFor({ timeout: 5000 });
  assert.match(await menu.locator(".umenu-vol-head b").innerText(), /100%/);

  await menu.locator(".umenu-range").evaluate((el) => {
    el.value = "200";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await pageA.locator(".umenu-vol-head b", { hasText: "200%" }).waitFor({ timeout: 5000 });

  const loud = await pageA.evaluate(() => window.__nexusVoice.audioDebug());
  assert.ok(
    loud.some(
      (item) => item.volumeSet === 2 && (item.gain === null ? item.volume === 1 : Math.abs(item.gain - 2) < 0.05)
    ),
    "громкость 200% доехала до звука"
  );

  await menu.locator(".umenu-range").evaluate((el) => {
    el.value = "30";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const quiet = await pageA.evaluate(() => window.__nexusVoice.audioDebug());
  assert.ok(
    quiet.some(
      (item) => item.volumeSet === 0.3 && (item.gain === null ? Math.abs(item.volume - 0.3) < 0.01 : Math.abs(item.gain - 0.3) < 0.01)
    ),
    "громкость 30% тоже применяется"
  );

  await pageA.locator(".umenu-btn", { hasText: "Заглушить у себя" }).click();
  await pageA.locator(".umenu-btn", { hasText: "Включить звук" }).waitFor({ timeout: 5000 });

  const hushed = await pageA.evaluate(() => window.__nexusVoice.audioDebug());
  assert.ok(hushed.some((item) => item.silent), "личный мьют отмечен");
  assert.ok(
    hushed.every((item) => item.gain === null || item.gain === 0),
    "личный мьют глушит звук до нуля"
  );

  await contextA.close();
  await contextB.close();
});

test("стрим: качество и кадры меняются на ходу и демонстрация не рвётся", async (t) => {
  await startServer();
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async (constraints) => {
      const video = (constraints && constraints.video) || {};
      const width = (video.width && video.width.ideal) || 1280;
      const height = (video.height && video.height.ideal) || 720;
      const fps = (video.frameRate && video.frameRate.ideal) || 15;
      window.__screenAsk = { width, height, fps };
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      let hue = 0;
      setInterval(() => {
        hue = (hue + 6) % 360;
        ctx.fillStyle = `hsl(${hue} 80% 50%)`;
        ctx.fillRect(0, 0, width, height);
      }, 100);
      return canvas.captureStream(fps);
    };
  });

  await register(pageA, "Артём");
  await register(pageB, "Мира");
  await joinVoice(pageB);
  await joinVoice(pageA);
  await pageB.locator(".node").nth(1).waitFor({ timeout: 20000 });

  await pageA.getByTitle("Демонстрация экрана").click();
  await pageB.locator(".stream-view").waitFor({ timeout: 20000 });

  const ask = await pageA.evaluate(() => window.__screenAsk);
  assert.deepEqual(ask, { width: 1920, height: 1080, fps: 60 }, "по умолчанию 1080p при 60 к/с");

  const mode = await pageA.evaluate(() => window.__nexusVoice.screenMode());
  assert.deepEqual(
    [mode.width, mode.height, mode.fps, mode.bitrate],
    [1920, 1080, 60, 8000000],
    "1080p/60 кодируется в 8 Мбит/с"
  );

  await pageA.locator('.profile-btn[aria-label="Настройки"]').click();
  await pageA.getByRole("button", { name: "Голос и видео" }).click();
  const resDd = pageA.locator(".dd").filter({ has: pageA.locator(".dd-btn", { hasText: "1080p" }) });
  await resDd.locator(".dd-btn").click();
  await resDd.locator(".dd-opt", { hasText: "1440p" }).click();
  const fpsDd = pageA.locator(".dd").filter({ has: pageA.locator(".dd-btn", { hasText: "60 к/с" }) });
  await fpsDd.locator(".dd-btn").click();
  await fpsDd.locator(".dd-opt", { hasText: "120 к/с" }).click();
  await pageA.keyboard.press("Escape");

  const big = await pageA.evaluate(() => window.__nexusVoice.screenMode());
  assert.deepEqual(
    [big.width, big.height, big.fps, big.bitrate],
    [2560, 1440, 120, 30000000],
    "2560×1440 при 120 к/с идёт на 30 Мбит/с"
  );

  const deadline = Date.now() + 30000;
  let alive = false;
  while (Date.now() < deadline) {
    alive = await pageB.evaluate(() =>
      [...document.querySelectorAll(".stream-feed video")].some(
        (node) => node.srcObject && node.srcObject.getVideoTracks().some((tr) => tr.readyState === "live")
      )
    );
    if (alive) break;
    await pageB.waitForTimeout(500);
  }
  assert.ok(alive, "после смены режима демонстрация продолжает играть у Миры");

  await pageB.waitForTimeout(2500);
  const stats = await audioBytes(pageB);
  const screen = stats.find((item) => item.kind === "video" && item.source === "screen");
  assert.ok(screen && screen.bytes > 0, "пакеты стрима идут и после смены режима");

  await contextA.close();
  await contextB.close();
});
