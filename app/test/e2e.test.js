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
  dataDir = mkdtempSync(join(tmpdir(), "nexus-e2e-"));
  const port = 8300 + Math.floor(Math.random() * 400);
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
    /* Windows may still hold the sqlite file; the temp folder is disposable */
  }
}

async function register(page, { name, code = "secret123", inviteCode }) {
  await page.goto(`${base}/?server=${encodeURIComponent(base)}`);
  await page.getByRole("button", { name: "У меня инвайт" }).click();
  await page.getByLabel("Код приглашения").fill(inviteCode ?? invite);
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Код доступа").fill(code);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
}

test("клиент: регистрация, каналы, отправка и доставка в реальном времени", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await register(pageA, { name: "Артём" });

  await pageA.getByRole("heading", { name: "#general" }).waitFor();
  const channels = await pageA.locator(".chan").allTextContents();
  assert.ok(channels.some((c) => c.includes("general")), "канал general в панели");
  assert.ok(channels.some((c) => c.includes("Кухня")), "голосовой канал в панели");

  await pageA.getByPlaceholder("Написать в #general").fill("привет из теста");
  await pageA.getByPlaceholder("Написать в #general").press("Enter");
  await pageA.getByText("привет из теста").waitFor();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await register(pageB, { name: "Мира" });
  await pageB.getByRole("heading", { name: "#general" }).waitFor();
  await pageB.getByText("привет из теста").waitFor({ timeout: 10000 });

  await pageB.getByPlaceholder("Написать в #general").fill("и тебе привет");
  await pageB.getByPlaceholder("Написать в #general").press("Enter");
  await pageA.getByText("и тебе привет").waitFor({ timeout: 10000 });

  await contextA.close();
  await contextB.close();
});

test("клиент: неверный инвайт не пускает в чат", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Чужой", inviteCode: "definitely-wrong" });
  await page.getByText("Инвайт не найден или устарел").waitFor();
  assert.equal(await page.locator(".chan").count(), 0, "в чат не пустило");
});

test("клиент: неверный код доступа при входе отклоняется", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });
  await page.getByRole("heading", { name: "#general" }).waitFor();

  await page.getByRole("button", { name: "выйти" }).click();
  await page.getByLabel("Имя").fill("Артём");
  await page.getByLabel("Код доступа").fill("wrong-code");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByText("Неверное имя или код доступа").waitFor();
  assert.equal(await page.locator(".chan").count(), 0, "в чат не пустило");
});
