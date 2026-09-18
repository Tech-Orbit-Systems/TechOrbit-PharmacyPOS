const { contextBridge, ipcRenderer } = require("electron");
// No arbitrary IPC, filesystem, database, or Node access is exposed to the renderer.
const methods = [
  "productList", "productDetail", "productSave", "productSuppliers", "packingDetail", "packingSave",
  "shiftStatus",
  "createCustomer",
  "login",
  "logout",
  "changePassword",
  "dashboard",
  "search",
  "barcode",
  "alternativeSearch",
  "alternativeSelect",
  "inventoryList",
  "inventoryDetail",
  "openingStockProducts",
  "openingStockPreviewManual",
  "openingStockPreviewFile",
  "openingStockTemplate",
  "openingStockCommit",
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
