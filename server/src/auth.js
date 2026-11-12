import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

export function hashCode(code, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(code), salt, KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyCode(code, hash, salt) {
  const candidate = scryptSync(String(code), salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

export function newInvite() {
  return randomBytes(6).toString("base64url");
}
