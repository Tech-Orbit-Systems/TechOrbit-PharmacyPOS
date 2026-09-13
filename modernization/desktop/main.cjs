const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path"),
  { Worker } = require("node:worker_threads");
const { pathToFileURL } = require("url");
// This separate entry never imports legacy server.js or opens the production data by default.
app.setName("TechOrbit UI Review");
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
  ]) {
    ipcMain.handle("pharmacy:" + command, (event, input) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== entryUrl
      )
        throw Error("Untrusted sender");
      if (JSON.stringify(input ?? {}).length > 100000)
        throw Error("Request too large");
      return new Promise((resolve, reject) => {
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
    });
  }
  window.once("ready-to-show", () => window.show());
  window.loadURL(entryUrl);
});
app.on("window-all-closed", () => {
  worker?.terminate();
  app.quit();
});
