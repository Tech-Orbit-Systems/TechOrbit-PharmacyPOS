const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const path = require("path"),
  { Worker } = require("node:worker_threads");
const fs = require('node:fs/promises');
const { pathToFileURL } = require("url");
// This separate entry never imports legacy server.js or opens the production data by default.
app.setName("TechOrbit UI Review");
const e2eCompatibility = process.env.TECHORBIT_E2E_COMPATIBILITY === "1";
if (process.env.TECHORBIT_DISABLE_HARDWARE_ACCELERATION === "1" || e2eCompatibility)
  app.disableHardwareAcceleration();
if (e2eCompatibility) {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}
const userData = process.env.TECHORBIT_UI_DATA_DIR;
if (userData) app.setPath("userData", path.resolve(userData));
let worker, window;
let sequence = 0;
const pending = new Map();
app.whenReady().then(() => {
  const demo = !process.env.TECHORBIT_UI_DATABASE;
  const filename =
    process.env.TECHORBIT_UI_DATABASE ||
    path.join(app.getPath("userData"), "review.sqlite3");
  worker = new Worker(path.join(__dirname, "worker.cjs"), {
    workerData: { filename, demo },
  });
  worker.on("message", ({ id, result, error }) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    error ? entry.reject(Error(error)) : entry.resolve(result);
  });
  worker.on("error", (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error("Data service unavailable: " + error.message));
    }
    pending.clear();
  });
  const entryUrl = pathToFileURL(
    path.join(__dirname, "../dist/index.html"),
  ).href;
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "TechOrbit Pharmacy POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  for (const command of [
  "productList", "productDetail", "productSave", "productSuppliers", "packingDetail", "packingSave",
    "productImportInspect", "productImportPreview", "productImportTemplate", "productImportErrors", "productImportCommit",
    "shiftStatus", "closingShiftPreview", "closingPeriodPreview", "closingHandover", "closingShiftOpen", "closingShiftClose",
    "closingDayPreview", "closingDayClose", "closingDayHistory", "closingDayDetail", "closingDayRevise",
    "closingConfig", "closingSavePolicy", "closingSaveAccount", "closingAllocate", "closingSavingsTransfer",
    "closingPeriodRangePreview", "closingPeriodCompletedPreview", "closingPeriodClose", "closingPeriodHistory", "closingPeriodDetail", "closingPeriodRevise", "closingPeriodExport",
    "createCustomer",
    "customerSearch", "customerDetail", "duesList", "duesHistory", "receivableCollect", "supplierPay", "vendorPay",
    "expenseMetadata", "vendorSave", "expenseList", "expensePost", "expenseVoid",
    "login",
    "reportProfitLoss", "reportEntries", "reportExport",
    "dailySalesSummary", "dailySalesEntries", "dailySalesExport",
    "medicineSummary", "medicineEntries", "medicineExport",
    "customerReturnSummary", "customerReturnEntries", "customerReturnExport",
    "supplierReturnSummary", "supplierReturnEntries", "supplierReturnExport",
    "purchaseSummary", "purchaseEntries", "purchaseExport", "supplierPurchaseSummary", "supplierPurchaseEntries", "supplierPurchaseExport",
    "bonusStockSummary", "bonusStockEntries", "bonusStockExport",
    "lowStockSummary", "lowStockEntries", "lowStockExport",
    "expirySummary", "expiryEntries", "expiryExport",
    "batchStockSummary", "batchStockEntries", "batchStockExport",
    "stockMovementSummary", "stockMovementEntries", "stockMovementExport",
    "adjustmentSummary", "adjustmentEntries", "adjustmentExport",
    "stockValuationSummary", "stockValuationEntries", "stockValuationExport",
    "customerBalanceSummary", "customerBalanceEntries", "customerBalanceExport",
    "supplierBalanceSummary", "supplierBalanceEntries", "supplierBalanceExport",
    "vendorBalanceSummary", "vendorBalanceEntries", "vendorBalanceExport",
    "overdueBalanceSummary", "overdueBalanceEntries", "overdueBalanceExport",
    "settlementSummary", "settlementEntries", "settlementExport",
    "logout",
    "changePassword",
    "dashboard",
    "search",
    "barcode",
    "alternativeSearch",
    "alternativeSelect",
    "inventoryList",
    "inventoryDetail",
    "stockAdjustmentDetail",
    "stockAdjustmentPost",
    "supplierList", "supplierSave", "purchaseProducts", "purchasePreview", "purchasePost", "purchaseHistory", "purchaseDetail",
    "openingStockProducts",
    "openingStockPreviewManual",
    "openingStockPreviewFile",
    "openingStockTemplate",
    "openingStockCommit",
    "customers",
    "customerReturnPreview", "customerReturnPost", "supplierReturnPreview", "supplierReturnPost",
    "invoiceSearch",
    "invoiceDetail",
    "customerHistory",
    "ledger",
    "quote",
    "post",
    "saleRecovery",
  ]) {
    ipcMain.handle("pharmacy:" + command, (event, input) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== entryUrl
      )
        throw Error("Untrusted sender");
      const requestLimit = ["openingStockPreviewFile","productImportInspect","productImportPreview"].includes(command) ? 12000000 : 100000;
      if (JSON.stringify(input ?? {}).length > requestLimit)
        throw Error("Request too large");
      const result=new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            Error(
              "Operation timed out. Retry the same sale to check its result.",
            ),
          );
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, command, input });
      });
      if(command!=='closingPeriodExport'&&command!=='reportExport'&&command!=='dailySalesExport'&&command!=='medicineExport'&&command!=='customerReturnExport'&&command!=='supplierReturnExport'&&command!=='purchaseExport'&&command!=='supplierPurchaseExport'&&command!=='bonusStockExport'&&command!=='lowStockExport'&&command!=='expiryExport'&&command!=='batchStockExport'&&command!=='stockMovementExport'&&command!=='adjustmentExport'&&command!=='stockValuationExport'&&command!=='customerBalanceExport'&&command!=='supplierBalanceExport'&&command!=='vendorBalanceExport'&&command!=='overdueBalanceExport'&&command!=='settlementExport')return result;
      return result.then(async ({filename,csv,base64})=>{
        const extension=filename.split('.').at(-1);
        const title=command==='reportExport'?'Export P&L report':command==='dailySalesExport'?'Export daily sales report':command==='medicineExport'?'Export sales by medicine':`Export ${filename.replace(/^TechOrbit_/, '').replace(/\.[^.]+$/, '').replaceAll('_', ' ')}`;
        const choice=await dialog.showSaveDialog(window,{title,defaultPath:filename,filters:[{name:`${extension.toUpperCase()} report`,extensions:[extension]} ]});
        if(choice.canceled||!choice.filePath)return {saved:false};
        await fs.writeFile(choice.filePath,base64?Buffer.from(base64,'base64'):csv,base64?undefined:'utf8');
        return {saved:true};
      });
    });
  }
  window.once("ready-to-show", () => window.show());
  window.loadURL(entryUrl);
});
app.on("window-all-closed", () => {
  worker?.terminate();
  app.quit();
});
