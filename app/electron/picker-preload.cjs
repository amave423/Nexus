const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  onSources(callback) {
    ipcRenderer.on("picker:sources", (_event, list) => callback(list));
  },
  choose(id) {
    ipcRenderer.send("picker:choose", id);
  },
  cancel() {
    ipcRenderer.send("picker:cancel");
  },
});
