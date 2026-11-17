import test from "node:test";
import assert from "node:assert/strict";
import { isMentioned, mentionRegex, mentionHandles } from "../src/lib/mention.js";

test("упоминание по нику с пробелом", () => {
  const keys = ["Мега потрошитель онала"];
  assert.equal(isMentioned("слушай @Мега потрошитель онала там сбор", keys), true);
});

test("имя без логина упоминается целиком", () => {
  const keys = ["Пётр Иванов"];
  assert.equal(isMentioned("@Пётр Иванов привет", keys), true);
  assert.equal(isMentioned("@Пётр привет", keys), false);
});

test("начало другого слова не считается упоминанием", () => {
  assert.equal(isMentioned("@мегаполис привет", ["мега"]), false);
  assert.equal(isMentioned("@мега, привет", ["мега"]), true);
  assert.equal(isMentioned("@Мега", ["мега"]), true);
});

test("логин без пробела", () => {
  assert.equal(isMentioned("эй @meow_1 глянь", ["meow_1"]), true);
  assert.equal(isMentioned("эй @meow_1 глянь", ["meow"]), false);
});

test("без собаки упоминания нет", () => {
  assert.equal(isMentioned("просто текст", ["мега"]), false);
  assert.equal(isMentioned("", ["мега"]), false);
});

test("пустой список ключей не ломает проверку", () => {
  assert.equal(isMentioned("@admin привет", []), false);
  assert.deepEqual(mentionHandles([]), []);
});

test("разметка: упоминание с пробелом не рвётся на части", () => {
  const re = new RegExp(`(${mentionRegex(["Мега потрошитель онала"]).source})`, "giu");
  const parts = "да @Мега потрошитель онала ты тут".split(re);
  assert.ok(parts.includes("@Мега потрошитель онала"), parts.join("|"));
});
