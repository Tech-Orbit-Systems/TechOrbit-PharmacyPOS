const { contextBridge, ipcRenderer } = require("electron");
// No arbitrary IPC, filesystem, database, or Node access is exposed to the renderer.
const methods = [
  "shiftStatus",
  "createCustomer",
  "login",
  "logout",
  "changePassword",
  "dashboard",
  "search",
  "barcode",
  "customers",
  "ledger",
  "quote",
  "post",
];
contextBridge.exposeInMainWorld(
  "pharmacy",
  Object.fromEntries(
    methods.map((name) => [
      name,
      (input) => ipcRenderer.invoke("pharmacy:" + name, input),
    ]),
  ),
);
