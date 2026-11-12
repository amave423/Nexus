import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, seed } from "./db.js";
import { buildApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NEXUS_DATA_DIR || join(here, "..", "data");
const port = Number(process.env.NEXUS_PORT || 8091);
const host = process.env.NEXUS_HOST || "127.0.0.1";

const db = openDb(join(dataDir, "nexus.db"));

const hasSpace = db.prepare("SELECT COUNT(*) AS n FROM spaces").get().n > 0;
if (!hasSpace) {
  seed(db);
  console.log("[nexus] создано пространство по умолчанию");
}

const app = buildApp({ db, logger: false });

try {
  await app.voice.init();
  console.log("[nexus] голосовой сервер готов");
} catch (error) {
  console.error("[nexus] голос не поднялся:", error.message);
}

const invite = app.ensureInvite();
if (invite) console.log(`[nexus] инвайт-код: ${invite}`);

await app.listen({ port, host });
console.log(`[nexus] слушаю http://${host}:${port}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await app.voice.close();
    await app.close();
    db.close();
    process.exit(0);
  });
}
