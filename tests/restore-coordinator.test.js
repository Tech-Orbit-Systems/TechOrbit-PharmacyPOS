const fs=require('fs');
const os=require('os');
const path=require('path');
const {openDatabase}=require('../infrastructure/sqlite/database');
const {BackupManager,sha256}=require('../infrastructure/backup/backup-manager');
const {restoreAndReconcile}=require('../infrastructure/backup/restore-coordinator');
const Database=require('better-sqlite3');
const {current:readConfiguration}=require('../modernization/desktop/settings.cjs');

describe('P067 coordinated restore',()=>{
  let dir,databaseFile,backupDir,db,manager,created,versions;
  beforeEach(async()=>{
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'to-restore-'));databaseFile=path.join(dir,'live.sqlite3');backupDir=path.join(dir,'backups');
    db=openDatabase({filename:databaseFile});
    db.prepare("INSERT INTO Suppliers(name,created_at,updated_at) VALUES ('Backup state',datetime('now'),datetime('now'))").run();
    manager=new BackupManager({db,databaseFile,backupDir});
    const configuration={invoicePrefix:'TO',backupRetentionDays:30};
    created=await manager.create({label:'restore-test',configuration});
    versions=db.prepare('SELECT version FROM SchemaMigrations ORDER BY version').all().map(row=>row.version);
  });
  afterEach(()=>{if(db?.open)db.close();fs.rmSync(dir,{recursive:true,force:true});});
  function closeLive(){db.pragma('wal_checkpoint(TRUNCATE)');db.close();}
  test('restores the exact verified backup, preserves current state and audits reconciliation',()=>{
    db.prepare("INSERT INTO Suppliers(name,created_at,updated_at) VALUES ('After backup',datetime('now'),datetime('now'))").run();closeLive();
    const result=restoreAndReconcile({databaseFile,backupDir,backupName:path.basename(created.file),allowedMigrationVersions:versions,actor:{id:1,roleCode:'admin',reason:'Recover the verified pharmacy state'},readConfiguration});
    expect(result.restored).toBe(true);expect(result.requiresSignIn).toBe(true);expect(result.safetyFile).toMatch(/^recovery[\\/]pre-restore-/);expect(fs.existsSync(path.join(backupDir,result.safetyFile))).toBe(true);
    db=openDatabase({filename:databaseFile});
    expect(db.prepare("SELECT COUNT(*) count FROM Suppliers WHERE name='Backup state'").get().count).toBe(1);
    expect(db.prepare("SELECT COUNT(*) count FROM Suppliers WHERE name='After backup'").get().count).toBe(0);
    expect(db.prepare("SELECT reason FROM AuditLog WHERE action='backup.restore' ORDER BY id DESC").get().reason).toBe('Recover the verified pharmacy state');
  });
  test('rejects path traversal, corrupt data and newer schema before replacing live data',()=>{
    expect(()=>manager.verify('../outside.sqlite3')).toThrow(/configured backup/);
    const corrupt=path.basename(created.file);fs.appendFileSync(created.file,'tamper');closeLive();
    expect(()=>restoreAndReconcile({databaseFile,backupDir,backupName:corrupt,allowedMigrationVersions:versions,actor:{id:1,roleCode:'admin',reason:'Recover after a serious outage'},readConfiguration})).toThrow(/checksum/);
    db=openDatabase({filename:databaseFile});expect(db.prepare("SELECT name FROM Suppliers WHERE name='Backup state'").get().name).toBe('Backup state');db.close();
    fs.rmSync(created.file);fs.rmSync(`${created.file}.json`);fs.rmSync(`${created.file}.config.json`);
    db=openDatabase({filename:databaseFile});manager=new BackupManager({db,databaseFile,backupDir});
  });
  test('configuration reconciliation failure rolls back the operational database and keeps the backup',()=>{
    db.prepare("INSERT INTO Suppliers(name,created_at,updated_at) VALUES ('Last good live',datetime('now'),datetime('now'))").run();closeLive();
    const configFile=`${created.file}.config.json`,manifestFile=`${created.file}.json`;
    const config=JSON.parse(fs.readFileSync(configFile,'utf8'));config.settings.invoicePrefix='MISMATCH';fs.writeFileSync(configFile,JSON.stringify(config));
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));manifest.configuration.sha256=sha256(configFile);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
    expect(()=>restoreAndReconcile({databaseFile,backupDir,backupName:path.basename(created.file),allowedMigrationVersions:versions,actor:{id:1,roleCode:'admin',reason:'Recover after a serious outage'},readConfiguration})).toThrow(/configuration/);
    expect(fs.existsSync(created.file)).toBe(true);db=openDatabase({filename:databaseFile});expect(db.prepare("SELECT name FROM Suppliers WHERE name='Last good live'").get().name).toBe('Last good live');
  });
  test('rejects an internally consistent backup containing an unknown newer migration',()=>{
    const backupDb=new Database(created.file);backupDb.prepare("INSERT INTO SchemaMigrations(version,applied_at) VALUES('999_future.sql',datetime('now'))").run();backupDb.close();
    const manifestFile=`${created.file}.json`,manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    manifest.sha256=sha256(created.file);manifest.schemaMigrations+=1;manifest.migrationVersions=[...manifest.migrationVersions,'999_future.sql'];fs.writeFileSync(manifestFile,JSON.stringify(manifest));
    closeLive();
    expect(()=>restoreAndReconcile({databaseFile,backupDir,backupName:path.basename(created.file),allowedMigrationVersions:versions,actor:{id:1,roleCode:'admin',reason:'Recover after a serious outage'},readConfiguration})).toThrow(/newer|incompatible/);
    db=openDatabase({filename:databaseFile});expect(db.prepare("SELECT name FROM Suppliers WHERE name='Backup state'").get().name).toBe('Backup state');
  });
});
