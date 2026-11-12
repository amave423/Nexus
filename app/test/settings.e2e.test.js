import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const serverEntry = join(root, "server", "src", "index.js");
const webDir = join(root, "app", "dist");

let child;
let base;
let invite;
let dataDir;

function startServer() {
  dataDir = mkdtempSync(join(tmpdir(), "nexus-set-"));
  const port = 8700 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NEXUS_PORT: String(port),
      NEXUS_HOST: "127.0.0.1",
      NEXUS_DATA_DIR: dataDir,
      NEXUS_WEB_DIR: webDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("сервер не поднялся")), 20000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/инвайт-код: (\S+)/);
      if (match) invite = match[1];
      if (text.includes("слушаю") && invite) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("Error")) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
  });
}

async function stopAll(browser) {
  await browser.close();
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the sqlite file */
  }
}

async function register(page, { name, code = "secret123" }) {
  await page.goto(`${base}/?server=${encodeURIComponent(base)}`);
  await page.getByRole("button", { name: "У меня инвайт" }).click();
  await page.getByLabel("Код приглашения").fill(invite);
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Код доступа").fill(code);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.getByRole("heading", { name: "#general" }).waitFor();
}

const accent = (page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue("--acid").trim());

test("настройки: акцент и тема применяются и переживают перезагрузку", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });

  await page.locator(".profile-btn").click();
  await page.getByRole("button", { name: "Внешний вид" }).click();
  await page.locator('.swatch[title="лёд"]').click();
  assert.equal(await accent(page), "#6fe3ff", "акцент перекрасился");

  await page.locator(".dd-btn").first().click();
  await page.locator(".dd-opt", { hasText: "Полночь" }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "night",
    "тема переключилась"
  );

  await page.reload();
  await page.getByRole("heading", { name: "#general" }).waitFor();
  assert.equal(await accent(page), "#6fe3ff", "акцент сохранился");
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "night",
    "тема сохранилась"
  );
});

test("настройки: имя меняется и видно в чате", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });

  await page.locator(".profile-btn").click();
  await page.locator("#setName").fill("Артём К");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText("сохранено").waitFor();
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.getByPlaceholder("Написать в #general").fill("новое имя");
  await page.getByPlaceholder("Написать в #general").press("Enter");
  await page.locator(".msg-head b", { hasText: "Артём К" }).waitFor();
});

test("настройки: аватар загружается и появляется в панели", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });

  await page.locator(".profile-btn").click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.locator(".me .avatar img").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".me .avatar img").count(), 1, "аватар в панели");
});

test("настройки сервера: роль создаётся и назначается участнику", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const owner = await browser.newPage();
  await register(owner, { name: "Артём" });

  const guest = await browser.newPage();
  await register(guest, { name: "Мира" });

  await owner.locator(".coin").click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("button", { name: "Роли" }).click();
  await owner.locator(".role-new .set-input").fill("Дизайнер");
  await owner.getByRole("button", { name: "Создать" }).click();
  await owner.locator(".set-role .nm", { hasText: "Дизайнер" }).waitFor();

  await dialog.getByRole("button", { name: "Участники" }).click();
  const row = owner.locator(".set-role", { hasText: "Мира" });
  await row.getByRole("button", { name: "роли" }).click();
  await owner.locator(".perm", { hasText: "Дизайнер" }).locator("input").check();
  await owner.getByRole("button", { name: "Сохранить" }).click();
  await owner.locator(".role-chips i", { hasText: "Дизайнер" }).waitFor();

  await guest.locator(".icon-btn[aria-label='Участники']").click();
  await guest.locator(".member-who span", { hasText: "Дизайнер" }).waitFor({ timeout: 10000 });
});

test("настройки сервера: приглашение создаётся, участник его не видит", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const owner = await browser.newPage();
  await register(owner, { name: "Артём" });

  await owner.locator(".coin").click();
  await owner.getByRole("dialog").getByRole("button", { name: "Приглашения" }).click();
  await owner.getByRole("button", { name: "Создать" }).click();
  await owner.locator(".set-invite .set-input").waitFor();
  const code = await owner.locator(".set-invite .set-input").inputValue();
  assert.ok(code.length >= 6, "код приглашения выдан");

  const guest = await browser.newPage();
  await register(guest, { name: "Мира" });
  await guest.locator(".coin").click();
  await guest.getByRole("dialog").getByRole("button", { name: "Приглашения" }).click();
  await guest.getByText("Приглашения доступны владельцу и админам").waitFor();
});
