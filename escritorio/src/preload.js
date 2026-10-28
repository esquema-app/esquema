// Puente entre la interfaz (ui/) y el proceso principal. La interfaz llama window.esquemaEscritorio.enviar(msg) (igual que
// webkit.messageHandlers.esquema en Mac); el principal responde ejecutando window.Esquema.<función>(json).
// Con contextIsolation y sandbox: la página no ve Node ni ipcRenderer, solo esta función.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ESQUEMA_HOST", process.platform === "win32" ? "windows" : "linux");
contextBridge.exposeInMainWorld("esquemaEscritorio", {
  enviar: (msg) => ipcRenderer.send("esquema", JSON.parse(JSON.stringify(msg))),
});
