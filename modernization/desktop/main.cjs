const { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net } = require("electron");
const path = require("path"),
  { Worker } = require("node:worker_threads");
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require("url");
const {validateInput}=require('./ipc-contract.cjs');
const { SCHEME, ENTRY_URL, resolveAppAsset } = require('./app-protocol.cjs');
const {publicError}=require('./ipc-error.cjs');
// This separate entry never imports legacy server.js or opens the production data by default.
protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setName("TechOrbit Pharmacy POS Demo");
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
let worker, window, databaseFilename, demoWorkspace, reviewPassword;
let sequence = 0;
const pending = new Map();
function requestWorker(command,input,timeoutMs=30000) {
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(Error('Operation timed out. Retry the same sale to check its result.'));
    },timeoutMs);
    pending.set(id,{resolve,reject,timer});
    worker.postMessage({id,command,input});
  });
}
async function ipcResponse(work) {
  const requestId=`IPC-${++sequence}`;
  try { return {ok:true,result:await work()}; }
  catch (error) { return {ok:false,error:publicError(error,requestId)}; }
}
function rejectPending(message) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(Error(message));
  }
  pending.clear();
}
function startWorker(filename, demo) {
  return new Promise((resolve, reject) => {
    let ready = false;
  worker = new Worker(path.join(__dirname, "worker.cjs"), {
    workerData: { filename, demo, reviewPassword:demo?reviewPassword:null },
  });
    worker.on("message", ({ id, result, error, ready: isReady }) => {
      if (isReady) {
        ready = true;
        resolve();
        return;
      }
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    error ? entry.reject(Error(error)) : entry.resolve(result);
  });
  worker.on("error", (error) => {
      rejectPending("Data service unavailable: " + error.message);
      if (!ready) reject(error);
  });
  });
}
async function resetDemoData() {
  if (!demoWorkspace) throw Error("Demo reset is unavailable for a live database.");
  rejectPending("Demo data reset in progress.");
  await worker?.terminate();
  for (const suffix of ["", "-wal", "-shm"])
    await fs.rm(databaseFilename + suffix, { force: true });
  await startWorker(databaseFilename, true);
}
app.whenReady().then(async () => {
  const distDirectory = path.join(__dirname, '../dist');
  protocol.handle(SCHEME, request => {
    if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
    const asset = resolveAppAsset(request.url, distDirectory);
    if (!asset) return new Response('Not found', {status:404});
    return net.fetch(pathToFileURL(asset).href);
  });
  demoWorkspace = !process.env.TECHORBIT_UI_DATABASE;
  if(demoWorkspace){
    if(e2eCompatibility) reviewPassword='TechOrbit-Demo-2026!';
    else {
      const accessFile=path.join(app.getPath('userData'),'review-access.json');
      try {
        const saved=JSON.parse(await fs.readFile(accessFile,'utf8'));
        if(typeof saved.password!=='string'||saved.password.length<20)throw Error('Invalid review access');
        reviewPassword=saved.password;
      } catch(error) {
        if(error.code!=='ENOENT'&&error.message!=='Invalid review access'&&!(error instanceof SyntaxError))throw error;
        reviewPassword=`${crypto.randomBytes(18).toString('base64url')}aA1!`;
        await fs.mkdir(path.dirname(accessFile),{recursive:true});
        await fs.writeFile(accessFile,JSON.stringify({password:reviewPassword}),{flag:'w',mode:0o600});
      }
    }
  }
  databaseFilename =
    process.env.TECHORBIT_UI_DATABASE ||
    path.join(app.getPath("userData"), "review.sqlite3");
  await startWorker(databaseFilename, demoWorkspace);
  const entryUrl = ENTRY_URL;
  ipcMain.handle('pharmacy:reviewAccess',event=>ipcResponse(()=>{
    if(!demoWorkspace||event.sender!==window?.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==entryUrl)throw Error('Review access unavailable');
    return {username:'demo',password:reviewPassword};
  }));
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "TechOrbit Pharmacy POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
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
  ipcMain.handle("pharmacy:resetDemo", event => ipcResponse(async () => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== entryUrl
    )
      throw Error("Untrusted sender");
    if (!demoWorkspace) throw Error('Demo reset is unavailable for a live database.');
    await requestWorker('__authorizeDemoReset',{});
    await resetDemoData();
    return { reset: true };
  }));
  for (const command of require("./commands.cjs").filter(name => name !== "resetDemo" && name !== "reviewAccess")) {
    ipcMain.handle("pharmacy:" + command, (event, input) => ipcResponse(async () => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== entryUrl
      )
        throw Error("Untrusted sender");
      input=validateInput(command,input);
      const requestLimit = ["openingStockPreviewFile","productImportInspect","productImportPreview"].includes(command) ? 12000000 : 100000;
      if (JSON.stringify(input ?? {}).length > requestLimit)
        throw Error("Request too large");
      const result=requestWorker(command,input);
      if(command!=='closingPeriodExport'&&command!=='reportExport'&&command!=='dailySalesExport'&&command!=='medicineExport'&&command!=='customerReturnExport'&&command!=='supplierReturnExport'&&command!=='purchaseExport'&&command!=='supplierPurchaseExport'&&command!=='bonusStockExport'&&command!=='lowStockExport'&&command!=='expiryExport'&&command!=='batchStockExport'&&command!=='stockMovementExport'&&command!=='adjustmentExport'&&command!=='stockValuationExport'&&command!=='customerBalanceExport'&&command!=='supplierBalanceExport'&&command!=='vendorBalanceExport'&&command!=='overdueBalanceExport'&&command!=='settlementExport'&&command!=='dailyClosingExport'&&command!=='auditExport')return result;
      return result.then(async ({filename,csv,base64})=>{
        const extension=filename.split('.').at(-1);
        const title=command==='reportExport'?'Export P&L report':command==='dailySalesExport'?'Export daily sales report':command==='medicineExport'?'Export sales by medicine':`Export ${filename.replace(/^TechOrbit_/, '').replace(/\.[^.]+$/, '').replaceAll('_', ' ')}`;
        const choice=await dialog.showSaveDialog(window,{title,defaultPath:filename,filters:[{name:`${extension.toUpperCase()} report`,extensions:[extension]} ]});
        if(choice.canceled||!choice.filePath)return {saved:false};
        await fs.writeFile(choice.filePath,base64?Buffer.from(base64,'base64'):csv,base64?undefined:'utf8');
        return {saved:true};
      });
    }));
  }
  window.once("ready-to-show", () => window.show());
  window.loadURL(entryUrl);
});
app.on("window-all-closed", () => {
  worker?.terminate();
  app.quit();
});
