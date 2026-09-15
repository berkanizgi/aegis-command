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
  onControl: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("aegis:control", listener);
    return () => ipcRenderer.removeListener("aegis:control", listener);
  },
  researchLayout: (value) => ipcRenderer.send("aegis:research-layout", value),
  onDesk: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on("aegis:desk", listener);
    return () => ipcRenderer.removeListener("aegis:desk", listener);
  },
  onVoiceStop: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("aegis:voice-stop", listener);
    return () => ipcRenderer.removeListener("aegis:voice-stop", listener);
  },
});
