const { contextBridge, ipcRenderer } = require("electron");
// No arbitrary IPC, filesystem, database, or Node access is exposed to the renderer.
const methods = require("./commands.cjs");
contextBridge.exposeInMainWorld(
  "pharmacy",
  Object.fromEntries(
    methods.map((name) => [
      name,
      (input) => ipcRenderer.invoke("pharmacy:" + name, input),
    ]),
  ),
);
