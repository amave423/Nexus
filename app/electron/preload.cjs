const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel) => (handler) => {
  const wrapped = (_event, ...args) => handler(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("nexus", {
  platform: process.platform,
  version: process.versions.electron,
  desktop: {
    setHotkeys: (keys) => ipcRenderer.send("desktop:hotkeys", keys),
    setVoiceState: (state) => ipcRenderer.send("desktop:voice", state),
    setBadge: (count) => ipcRenderer.send("desktop:badge", count),
    notify: (payload) => ipcRenderer.send("desktop:notify", payload),
    focus: () => ipcRenderer.send("desktop:focus"),
    onHotkey: listen("hotkey"),
    onTrayAction: listen("tray:action"),
    onNotifyOpen: listen("notify:open"),
    info: () => ipcRenderer.invoke("app:info"),
    checkUpdate: () => ipcRenderer.invoke("update:check"),
    installUpdate: () => ipcRenderer.send("update:install"),
    onUpdate: listen("update:state"),
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:maximize"),
    close: () => ipcRenderer.send("win:close"),
    onMaximized: listen("win:maximized"),
  },
  notify: {
    onData: listen("notify:data"),
    open: (channelId) => ipcRenderer.send("notify:open", channelId),
    close: () => ipcRenderer.send("notify:close"),
  },
});
