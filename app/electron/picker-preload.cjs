const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  onSources(callback) {
    ipcRenderer.on("picker:sources", (_event, data) => callback(data));
  },
  choose(id, settings) {
    ipcRenderer.send("picker:choose", {
      id,
      res: settings?.res || null,
      fps: settings?.fps || null,
    });
  },
  cancel() {
    ipcRenderer.send("picker:cancel");
  },
});
