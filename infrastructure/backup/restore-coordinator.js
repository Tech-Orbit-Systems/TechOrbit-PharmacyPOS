const fs=require('fs');
const path=require('path');
const {BackupManager}=require('./backup-manager');
const {openDatabase}=require('../sqlite/database');
const Database=require('better-sqlite3');

function tableCounts(db){
  const names=['Products','Batches','Sales','SaleItems','Purchases','PurchaseItems','Customers','Suppliers','Expenses','Receivables','Payables'];
  const existing=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  return Object.fromEntries(names.filter(name=>existing.has(name)).map(name=>[name,Number(db.prepare(`SELECT COUNT(*) count FROM ${name}`).get().count)]));
}
function archivedSettings(db,configuration,readConfiguration){
  if(!configuration)return true;
  const effective=readConfiguration?readConfiguration(db):Object.fromEntries(db.prepare('SELECT key,value_json FROM Settings').all().map(row=>[row.key,JSON.parse(row.value_json)]));
  for(const[key,value]of Object.entries(configuration.settings))if(!Object.hasOwn(effective,key)||JSON.stringify(effective[key])!==JSON.stringify(value))return false;
  return true;
}
function restoreAndReconcile({databaseFile,backupDir,backupName,allowedMigrationVersions,actor,readConfiguration}){
  const manager=new BackupManager({db:null,databaseFile,backupDir});
  const verified=manager.verify(backupName,{allowedMigrationVersions});
  const source=new Database(verified.file,{readonly:true,fileMustExist:true});
  const expectedCounts=tableCounts(source);source.close();
  const restored=manager.restoreOffline({backupFile:backupName,targetFile:databaseFile,databaseClosed:true,allowedMigrationVersions});
  let db;
  try{
    db=openDatabase({filename:databaseFile});
    if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('Restored database failed integrity reconciliation');
    if(!archivedSettings(db,restored.backup.configuration,readConfiguration))throw Error('Restored configuration does not match its archive');
    const counts=tableCounts(db),now=new Date().toISOString();
    for(const[name,count]of Object.entries(expectedCounts))if(counts[name]!==count)throw Error(`Restored ${name} count does not match the selected backup`);
    const user=db.prepare('SELECT id FROM Users WHERE id=?').get(actor.id);
    const safetyFile=restored.safetyFile?path.relative(backupDir,restored.safetyFile):'';
    db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,previous_json,new_json,reason)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(now,user?actor.id:null,actor.roleCode,'backup.restore','backup',path.basename(restored.backup.file),JSON.stringify({safetyFile}),JSON.stringify({sha256:restored.sha256,counts}),actor.reason);
    return{restored:true,backupName:path.basename(restored.backup.file),safetyFile,counts,requiresSignIn:true};
  }catch(error){
    if(db?.open)db.close();
    for(const suffix of['-wal','-shm'])if(fs.existsSync(databaseFile+suffix))fs.rmSync(databaseFile+suffix);
    if(restored.safetyFile&&fs.existsSync(restored.safetyFile))fs.copyFileSync(restored.safetyFile,databaseFile);
    throw error;
  }finally{if(db?.open)db.close();}
}
module.exports={restoreAndReconcile,tableCounts,archivedSettings};
