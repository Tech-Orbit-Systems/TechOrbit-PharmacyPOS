const { parentPort, workerData } = require("node:worker_threads");
const { openDatabase } = require("../../infrastructure/sqlite/database");
const { Gateway } = require("./gateway.cjs");
const db = openDatabase({ filename: workerData.filename });
if (workerData.demo) require("./demo.cjs").seedDemo(db);
const gateway = new Gateway(db, { demo: workerData.demo });
parentPort.on("message", async ({ id, command, input }) => {
  try {
    parentPort.postMessage({ id, result: await gateway.call(command, input) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
