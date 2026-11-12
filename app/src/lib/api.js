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

export async function upload(file, size = {}) {
  const query = size.width ? `?w=${size.width}&h=${size.height}` : "";
  const form = new FormData();
  form.append("file", file, file.name || "файл");
  const res = await fetch(`${SERVER}/api/upload${query}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

export function connect(onEvent, onStatus) {
  const url = SERVER.replace(/^http/, "ws") + "/ws?token=" + token;
  let socket = null;
  let closed = false;
  let retry = 0;
  let queue = [];

  const open = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      retry = 0;
      onStatus?.("online");
      const waiting = queue;
      queue = [];
      for (const text of waiting) socket.send(text);
    };
    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      onStatus?.("offline");
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
      socket?.close();
    },
  };
}
