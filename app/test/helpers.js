import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const serverEntry = join(root, "server", "src", "index.js");
const webDir = join(root, "app", "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function serveStatic() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = normalize(join(webDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(webDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      try {
        const body = await readFile(join(webDir, "index.html"));
        res.writeHead(200, { "content-type": TYPES[".html"] });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    }
  });
}

function boot(port, dataDir, env, timeout) {
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NEXUS_PORT: String(port),
      NEXUS_HOST: "127.0.0.1",
      NEXUS_DATA_DIR: dataDir,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let invite = null;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("сервер не поднялся"));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/инвайт-код: (\S+)/);
      if (match) invite = match[1];
      if (text.includes("слушаю") && invite) {
        clearTimeout(timer);
        resolve({ child, invite });
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("EADDRINUSE")) {
        clearTimeout(timer);
        child.kill();
        reject(Object.assign(new Error("port busy"), { busy: true }));
        return;
      }
      if (text.includes("Error")) {
        clearTimeout(timer);
        child.kill();
        reject(new Error(text));
      }
    });
  });
}

export async function startServer({ prefix = "nexus-e2e-", portBase = 8300, env = {}, timeout = 20000 } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), prefix));

  let child = null;
  let invite = null;
  let port = 0;
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    port = portBase + Math.floor(Math.random() * 2000);
    try {
      const booted = await boot(port, dataDir, env, timeout);
      child = booted.child;
      invite = booted.invite;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!error.busy) throw error;
    }
  }
  if (!child) throw lastError || new Error("сервер не поднялся");

  const apiBase = `http://127.0.0.1:${port}`;
  const staticServer = serveStatic();
  let staticPort = port + 400;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          staticServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          staticServer.off("error", onError);
          resolve();
        };
        staticServer.once("error", onError);
        staticServer.once("listening", onListening);
        staticServer.listen(staticPort, "127.0.0.1");
      });
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      staticPort = port + 400 + Math.floor(Math.random() * 2000);
    }
  }
  const base = `http://127.0.0.1:${staticPort}`;

  return { base, apiBase, invite, dataDir, child, staticServer };
}

export async function stopServer(harness) {
  if (!harness) return;
  await new Promise((resolve) => harness.staticServer.close(resolve));
  if (harness.child && harness.child.exitCode === null) {
    const exited = new Promise((resolve) => harness.child.once("exit", resolve));
    harness.child.kill();
    await exited;
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    rmSync(harness.dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the sqlite file; the temp folder is disposable */
  }
}
