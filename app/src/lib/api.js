const params = new URLSearchParams(location.search);

export const SERVER = (
  params.get("server") ||
  localStorage.getItem("nexus.server") ||
  "https://fiit.37.235.241.23.sslip.io"
).replace(/\/$/, "");

let token = localStorage.getItem("nexus.token") || null;

export const getToken = () => token;

export function setToken(value) {
  token = value;
  if (value) localStorage.setItem("nexus.token", value);
  else localStorage.removeItem("nexus.token");
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(SERVER + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

export function fileUrl(url) {
  if (!url) return "";
  return `${SERVER}${url}?token=${encodeURIComponent(token || "")}`;
}

export async function upload(file, size = {}, spaceId = null) {
  const query = new URLSearchParams();
  if (size.width) { query.set("w", size.width); query.set("h", size.height); }
  if (spaceId) query.set("space", spaceId);
  const suffix = query.size ? `?${query}` : "";
  const res = await fetch(`${SERVER}/api/upload${suffix}`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "файл"),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

export function connect(onEvent, onStatus, onPing) {
  const url = SERVER.replace(/^http/, "ws") + "/ws?token=" + token;
  let socket = null;
  let closed = false;
  let retry = 0;
  let queue = [];
  let pingTimer = null;
  let pingSent = 0;

  const stopPing = () => {
    clearInterval(pingTimer);
    pingTimer = null;
  };

  const startPing = () => {
    stopPing();
    const beat = () => {
      if (!socket || socket.readyState !== 1) return;
      pingSent = performance.now();
      socket.send(JSON.stringify({ t: "ping", ts: Date.now() }));
    };
    beat();
    pingTimer = setInterval(beat, 5000);
  };

  const open = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      retry = 0;
      onStatus?.("online");
      const waiting = queue;
      queue = [];
      for (const text of waiting) socket.send(text);
      startPing();
    };
    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.t === "pong") {
        if (pingSent) onPing?.(Math.max(1, Math.round(performance.now() - pingSent)));
        return;
      }
      onEvent(data);
    };
    socket.onclose = () => {
      stopPing();
      onStatus?.("offline");
      onPing?.(null);
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 400 * retry);
    };
  };

  open();

  return {
    send(payload) {
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      if (socket && socket.readyState === 1) socket.send(text);
      else queue.push(text);
    },
    close() {
      closed = true;
      stopPing();
      socket?.close();
    },
  };
}
