import test from "node:test";
import assert from "node:assert/strict";
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

async function register(page, { name, code = "secret123", inviteCode }) {
  await page.goto(`${base}/?server=${encodeURIComponent(harness.apiBase)}`);
  await page.getByRole("button", { name: "У меня инвайт" }).click();
  await page.getByLabel("Код приглашения").fill(inviteCode ?? invite);
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Пароль").fill(code);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
}

test("клиент: регистрация, каналы, отправка и доставка в реальном времени", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await register(pageA, { name: "Артём" });

  await pageA.locator(".chan.active", { hasText: "general" }).waitFor();
  const channels = await pageA.locator(".chan").allTextContents();
  assert.ok(channels.some((c) => c.includes("general")), "канал general в панели");
  assert.ok(channels.some((c) => c.includes("Кухня")), "голосовой канал в панели");

  await pageA.getByPlaceholder("Написать в #general").fill("привет из теста");
  await pageA.getByPlaceholder("Написать в #general").press("Enter");
  await pageA.getByText("привет из теста").waitFor();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await register(pageB, { name: "Мира" });
  await pageB.locator(".chan.active", { hasText: "general" }).waitFor();
  await pageB.getByText("привет из теста").waitFor({ timeout: 10000 });

  await pageB.getByPlaceholder("Написать в #general").fill("и тебе привет");
  await pageB.getByPlaceholder("Написать в #general").press("Enter");
  await pageA.getByText("и тебе привет").waitFor({ timeout: 10000 });

  await contextA.close();
  await contextB.close();
});

test("клиент: второй сервер создаётся, переключается и принимает по коду", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const owner = await browser.newPage();
  await register(owner, { name: "Артём" });
  await owner.locator(".chan.active", { hasText: "general" }).waitFor();

  await owner.getByRole("button", { name: "Новый сервер" }).click();
  await owner.getByPlaceholder("Название сервера").fill("Вторая");
  await owner.getByRole("button", { name: "Создать сервер" }).click();
  await owner.locator(".coin[title='Вторая']").waitFor();
  assert.equal(await owner.locator(".coin").count(), 3, "два сервера и кнопка плюс");

  await owner.locator(".coin[title='Вторая']").click();
  await owner.getByRole("dialog").getByRole("button", { name: "Приглашения" }).click();
  await owner.getByRole("button", { name: "Создать" }).click();
  await owner.locator(".set-invite .set-input").waitFor();
  const code = await owner.locator(".set-invite .set-input").inputValue();
  assert.ok(code.length >= 6, "код приглашения выдан");
  await owner.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();

  const guest = await browser.newPage();
  await register(guest, { name: "Мира" });
  await guest.locator(".chan.active", { hasText: "general" }).waitFor();
  assert.equal(await guest.locator(".coin[title='Вторая']").count(), 0, "чужой сервер не виден");

  await guest.getByRole("button", { name: "Новый сервер" }).click();
  await guest.getByPlaceholder("Код приглашения").fill(code);
  await guest.getByRole("button", { name: "Присоединиться" }).click();
  await guest.locator(".coin[title='Вторая']").waitFor({ timeout: 10000 });
  await guest.locator(".chan.active", { hasText: "general" }).waitFor();
});

test("клиент: пинг до сервера показывается в шапке", async (t) => {
  await startServer();
  const browser = await chromium.launch();
  t.after(() => stopAll(browser));

  const page = await browser.newPage();
  await register(page, { name: "Артём" });
  await page.locator(".chan.active", { hasText: "general" }).waitFor();

  const pill = page.locator(".stat", { hasText: "мс" });
  await pill.waitFor({ timeout: 15000 });
  const text = await pill.textContent();
  const value = Number(text.replace(/[^\d]/g, ""));
  assert.ok(value > 0 && value < 5000, `пинг измерен: ${text}`);
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
  await page.locator(".chan.active", { hasText: "general" }).waitFor();

  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await page.getByLabel("Имя").fill("Артём");
  await page.getByLabel("Пароль").fill("wrong-code");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByText("Неверное имя или пароль").waitFor();
  assert.equal(await page.locator(".chan").count(), 0, "в чат не пустило");
});
