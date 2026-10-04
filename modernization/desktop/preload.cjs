const { contextBridge, ipcRenderer } = require("electron");
// No arbitrary IPC, filesystem, database, or Node access is exposed to the renderer.
const methods = require("./commands.cjs");
contextBridge.exposeInMainWorld(
  "pharmacy",
  Object.fromEntries(
    methods.map((name) => [
      name,
      async (input) => {
        const response=await ipcRenderer.invoke("pharmacy:" + name, input);
        if(response.ok)return response.result;
        // ContextBridge strips custom properties from Error objects. A plain
        // cloneable rejection preserves the stable code and correlation ID.
        throw {name:'PharmacyError',...response.error};
      },
    ]),
  ),
);
