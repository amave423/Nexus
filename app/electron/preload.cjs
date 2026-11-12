const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("nexus", {
  platform: process.platform,
  version: process.versions.electron,
});
