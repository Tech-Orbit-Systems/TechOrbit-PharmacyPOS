const { parentPort, workerData } = require("node:worker_threads");
const { openDatabase } = require("../../infrastructure/sqlite/database");
const { Gateway } = require("./gateway.cjs");
const {validateInput}=require('./ipc-contract.cjs');
const path = require('node:path');
const {DailyBackup}=require('../../infrastructure/backup/daily-backup');
const db = openDatabase({ filename: workerData.filename });
if (workerData.demo) require("./demo.cjs").seedDemo(db,workerData.reviewPassword);
const gateway = new Gateway(db, { demo: workerData.demo });
const dailyBackup = workerData.filename === ':memory:' ? null : new DailyBackup({db,databaseFile:workerData.filename,backupDir:path.join(path.dirname(workerData.filename),'backups'),settings:()=>require('./settings.cjs').current(db)});
gateway.dailyBackup = dailyBackup;
parentPort.postMessage({ ready: true });
dailyBackup?.start();
parentPort.on("message", async ({ id, command, input }) => {
  try {
    if(command==='__authorizeDemoReset'){
      if(!workerData.demo)throw Error('Demo reset is unavailable for a live database.');
      await gateway.call('usersList',{});
      parentPort.postMessage({id,result:true});
    }else parentPort.postMessage({ id, result: await gateway.call(command, validateInput(command,input)) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
