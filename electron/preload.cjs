const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("aegis", {
  invoke: (operation, payload = {}) =>
    ipcRenderer.invoke("aegis:invoke", operation, payload),
  windowControl: (action) => ipcRenderer.send("aegis:window", action),
  onVoiceToggle: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aegis:voice-toggle", listener);
    return () => ipcRenderer.removeListener("aegis:voice-toggle", listener);
  },
  platform: process.platform,
});
