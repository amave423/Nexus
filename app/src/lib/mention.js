const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function mentionHandles(keys) {
  return [...new Set(keys.map((key) => String(key || "").trim().toLowerCase()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
}

export function mentionRegex(keys, flags = "gu") {
  const handles = mentionHandles(keys);
  if (!handles.length) return new RegExp("@[\\p{L}\\p{N}_.-]+", flags);
  return new RegExp(`@(?:${handles.map(escapeRe).join("|")})(?![\\p{L}\\p{N}_.])`, flags);
}

export function isMentioned(text, keys) {
  const value = String(text || "");
  if (!mentionHandles(keys).length || !value.includes("@")) return false;
  return mentionRegex(keys, "iu").test(value);
}
