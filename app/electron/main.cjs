const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  globalShortcut,
  nativeImage,
  screen,
  shell,
  protocol,
  net,
  session,
  desktopCapturer,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { autoUpdater } = require("electron-updater");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const DEV_URL = process.env.NEXUS_DEV_URL;

let win = null;
let tray = null;
let notifyWin = null;
let notifyTimer = null;
let quitting = false;
let voiceState = { muted: false, deafened: false, inChannel: false, channelName: "" };
let unread = 0;
let updateState = { status: "idle", version: null, percent: 0, error: null };

function pushUpdate(patch) {
  updateState = { ...updateState, ...patch };
  send("update:state", updateState);
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => pushUpdate({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) => {
    pushUpdate({ status: "downloading", version: info.version, percent: 0 });
  });
  autoUpdater.on("update-not-available", () => pushUpdate({ status: "latest" }));
  autoUpdater.on("download-progress", (progress) =>
    pushUpdate({ status: "downloading", percent: Math.round(progress.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    pushUpdate({ status: "ready", version: info.version, percent: 100 });
    showNotify({
      name: "Nexus",
      text: `Обновление ${info.version} готово. Нажми, чтобы перезапустить.`,
      color: "#c8ff3d",
      action: "update",
    });
  });
  autoUpdater.on("error", (error) =>
    pushUpdate({ status: "error", error: String(error?.message || error).slice(0, 200) })
  );
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

ipcMain.handle("app:info", () => ({ version: app.getVersion(), packaged: app.isPackaged }));

ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return { status: "dev" };
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    pushUpdate({ status: "error", error: String(error?.message || error).slice(0, 200) });
  }
  return updateState;
});

ipcMain.on("update:install", () => {
  quitting = true;
  autoUpdater.quitAndInstall(true, true);
});

const iconPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");

function trayImage() {
  const image = nativeImage.createFromPath(iconPath());
  return image.isEmpty() ? image : image.resize({ width: 16, height: 16 });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Открыть Nexus", click: showWindow },
    { type: "separator" },
    {
      label: "Микрофон",
      type: "checkbox",
      checked: !voiceState.muted,
      enabled: voiceState.inChannel,
      click: () => send("tray:action", "mic"),
    },
    {
      label: "Звук",
      type: "checkbox",
      checked: !voiceState.deafened,
      enabled: voiceState.inChannel,
      click: () => send("tray:action", "deaf"),
    },
    {
      label: voiceState.inChannel ? `Выйти из «${voiceState.channelName}»` : "Не в голосовом канале",
      enabled: voiceState.inChannel,
      click: () => send("tray:action", "leave"),
    },
    { type: "separator" },
    {
      label: "Выход",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (!tray) return;
  const parts = ["Nexus"];
  if (unread > 0) parts.push(`${unread} непрочитанных`);
  if (voiceState.inChannel) parts.push(`в «${voiceState.channelName}»`);
  tray.setToolTip(parts.join(" · "));
  tray.setContextMenu(buildTrayMenu());
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#08080a",
    autoHideMenuBar: true,
    title: "Nexus",
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  win.on("focus", () => {
    unread = 0;
    win.flashFrame(false);
    refreshTray();
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL("app://nexus/index.html");
}

function createTray() {
  tray = new Tray(trayImage());
  tray.on("click", showWindow);
  tray.on("double-click", showWindow);
  refreshTray();
}

function closeNotify() {
  clearTimeout(notifyTimer);
  if (notifyWin && !notifyWin.isDestroyed()) notifyWin.close();
  notifyWin = null;
}

let notifyAction = null;

function showNotify(payload) {
  closeNotify();
  notifyAction = payload.action || null;
  const area = screen.getPrimaryDisplay().workArea;
  const width = 360;
  const height = 104;
  notifyWin = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 18,
    y: area.y + area.height - height - 18,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  notifyWin.setAlwaysOnTop(true, "screen-saver");
  notifyWin.loadFile(path.join(__dirname, "notify.html"));
  notifyWin.webContents.once("did-finish-load", () => {
    notifyWin.webContents.send("notify:data", payload);
    notifyWin.showInactive();
  });
  notifyWin.on("closed", () => (notifyWin = null));
  notifyTimer = setTimeout(closeNotify, 5200);
}

let pickerWin = null;
let pickerResolve = null;

function closePicker(sourceId) {
  const resolve = pickerResolve;
  pickerResolve = null;
  if (pickerWin && !pickerWin.isDestroyed()) pickerWin.close();
  pickerWin = null;
  resolve?.(sourceId || null);
}

ipcMain.on("picker:choose", (_event, id) => closePicker(id));
ipcMain.on("picker:cancel", () => closePicker(null));

async function pickSource() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: false,
  });
  if (!sources.length) return null;
  const list = sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.id.startsWith("screen") ? "screen" : "window",
    thumb: source.thumbnail.toDataURL(),
  }));

  return new Promise((resolve) => {
    pickerResolve = resolve;
    pickerWin = new BrowserWindow({
      width: 720,
      height: 560,
      parent: win || undefined,
      modal: !!win,
      frame: false,
      resizable: false,
      backgroundColor: "#08080a",
      title: "Поделиться экраном",
      webPreferences: {
        preload: path.join(__dirname, "picker-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    pickerWin.loadFile(path.join(__dirname, "picker.html"));
    pickerWin.webContents.once("did-finish-load", () => {
      pickerWin.webContents.send("picker:sources", list);
    });
    pickerWin.on("closed", () => {
      pickerWin = null;
      const pending = pickerResolve;
      pickerResolve = null;
      pending?.(null);
    });
  });
}

function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sourceId = await pickSource();
        if (!sourceId) return callback({});
        const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
        const source = sources.find((item) => item.id === sourceId);
        if (!source) return callback({});
        callback({ video: source });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false }
  );
}

function accelerator(combo) {
  const map = { "↑": "Up", "↓": "Down", "←": "Left", "→": "Right", Esc: "Escape", Space: "Space" };
  return combo
    .split("+")
    .map((part) => map[part] || part)
    .join("+");
}

function registerHotkeys(keys) {
  globalShortcut.unregisterAll();
  for (const [action, combo] of Object.entries(keys || {})) {
    if (!combo) continue;
    try {
      globalShortcut.register(accelerator(combo), () => send("hotkey", action));
    } catch {
      /* сочетание занято другой программой */
    }
  }
}

ipcMain.on("desktop:hotkeys", (_event, keys) => registerHotkeys(keys));
ipcMain.on("desktop:voice", (_event, state) => {
  voiceState = { ...voiceState, ...state };
  refreshTray();
});
ipcMain.on("desktop:badge", (_event, count) => {
  unread = Number(count) || 0;
  if (win && !win.isDestroyed() && unread > 0 && !win.isFocused()) win.flashFrame(true);
  refreshTray();
});
ipcMain.on("desktop:notify", (_event, payload) => showNotify(payload));
ipcMain.on("desktop:focus", () => showWindow());
ipcMain.on("notify:open", (_event, channelId) => {
  const action = notifyAction;
  closeNotify();
  if (action === "update") {
    quitting = true;
    autoUpdater.quitAndInstall(true, true);
    return;
  }
  showWindow();
  send("notify:open", channelId);
});
ipcMain.on("notify:close", closeNotify);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.whenReady().then(() => {
    const root = path.join(__dirname, "..", "dist");
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === "/") rel = "/index.html";
      const target = path.normalize(path.join(root, rel));
      if (!target.startsWith(root)) return new Response("forbidden", { status: 403 });
      return net.fetch(pathToFileURL(target).toString());
    });
    setupDisplayMedia();
    createWindow();
    createTray();
    setupUpdates();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });
}

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (quitting) app.quit();
});
