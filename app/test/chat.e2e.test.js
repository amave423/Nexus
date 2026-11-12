import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startServer as bootServer, stopServer } from "./helpers.js";

let harness;
let base;
let invite;

async function startServer(opts) {
  harness = await bootServer(opts);
  base = harness.base;
  invite = harness.invite;
}

async function stopAll(browser) {
  await browser.close();
  await stopServer(harness);
}

async function register(page, { name, code = "secret123" }) {
  await page.goto(`${base}/?server=${encodeURIComponent(harness.apiBase)}`);
  await page.getByRole("button", { name: "У меня инвайт" }).click();
  await page.getByLabel("Код приглашения").fill(invite);
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Код доступа").fill(code);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.getByRole("heading", { name: "#general" }).waitFor();
}

const composer = (page) => page.getByPlaceholder("Написать в #general");

async function say(page, text) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await page.getByText(text, { exact: true }).waitFor();
}

test("чат: ответ, реакция, правка и удаление видны обоим", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const pageA = await browser.newPage();
  await register(pageA, { name: "Артём" });
  const pageB = await browser.newPage();
  await register(pageB, { name: "Мира" });

  await say(pageA, "кто идёт в голос?");
  await pageB.getByText("кто идёт в голос?").waitFor({ timeout: 10000 });

  const first = pageB.locator(".msg", { hasText: "кто идёт в голос?" }).first();
  await first.hover();
  await first.getByTitle("Ответить").click();
  await pageB.getByText("ответ").waitFor();
  await composer(pageB).fill("я пойду");
  await composer(pageB).press("Enter");

  const reply = pageA.locator(".msg", { hasText: "я пойду" }).first();
  await reply.waitFor({ timeout: 10000 });
  assert.match(await reply.locator(".reply").innerText(), /Артём[\s\S]*кто идёт в голос\?/);

  await reply.hover();
  await reply.getByTitle("Реакция").click();
  await reply.locator(".picker button", { hasText: "🔥" }).click();
  await pageA.locator(".chip", { hasText: "🔥" }).first().waitFor();
  await pageB.locator(".chip", { hasText: "🔥" }).first().waitFor({ timeout: 10000 });

  const own = pageB.locator(".msg", { hasText: "я пойду" }).first();
  await own.hover();
  await own.getByTitle("Изменить").click();
  await pageB.locator(".msg textarea").fill("я пойду, если позовёте");
  await pageB.getByRole("button", { name: "Сохранить" }).click();
  await pageA.getByText("я пойду, если позовёте").waitFor({ timeout: 10000 });
  await pageA.getByText("изменено").first().waitFor();

  const edited = pageB.locator(".msg", { hasText: "я пойду, если позовёте" }).first();
  await edited.hover();
  await edited.getByTitle("Удалить").click();
  await pageA.getByText("сообщение удалено").waitFor({ timeout: 10000 });
});

test("чат: поиск находит сообщение и переходит к нему", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });
  await say(page, "секретная встреча в пятницу");

  await page.getByRole("button", { name: "Поиск" }).click();
  await page.getByPlaceholder("Поиск по серверу").fill("встреча");
  const result = page.locator(".result", { hasText: "секретная встреча" });
  await result.waitFor({ timeout: 10000 });
  await result.click();
  await page.locator(".flash").waitFor();
  assert.ok(await page.getByText("секретная встреча в пятницу").isVisible());
});

test("чат: картинка загружается и показывается в ленте", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const dir = mkdtempSync(join(tmpdir(), "nexus-img-"));
  const file = join(dir, "pixel.png");
  writeFileSync(
    file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );

  const page = await browser.newPage();
  await register(page, { name: "Артём" });
  await page.locator("input.hidden-file").setInputFiles(file);
  await page.locator(".pend").waitFor();
  await composer(page).fill("смотри");
  await composer(page).press("Enter");

  const image = page.locator(".shot img").first();
  await image.waitFor({ timeout: 10000 });
  const loaded = await image.evaluate((img) => img.complete && img.naturalWidth > 0);
  assert.equal(loaded, true, "картинка реально загрузилась по токену");

  rmSync(dir, { recursive: true, force: true });
});

test("голос: шумодав RNNoise включается в проверке микрофона", async (t) => {
  await startServer();
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  t.after(() => stopAll(browser));

  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await register(page, { name: "Артём" });

  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Голос и видео" }).click();
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByText("шумодав включён — говори").waitFor({ timeout: 20000 });

  const mode = await page.locator(".set-row", { hasText: "Шумоподавление" }).locator(".dd-btn").innerText();
  assert.match(mode, /RNNoise/);
});
