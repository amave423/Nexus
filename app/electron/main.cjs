const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, screen, shell } = require("electron");
const path = require("node:path");

const DEV_URL = process.env.NEXUS_DEV_URL;

let win = null;
let tray = null;
let notifyWin = null;
let notifyTimer = null;
let quitting = false;
let voiceState = { muted: false, deafened: false, inChannel: false, channelName: "" };
let unread = 0;

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
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
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

function showNotify(payload) {
  closeNotify();
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
  closeNotify();
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
    createWindow();
    createTray();
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
