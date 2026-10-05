const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const backupName = name => /^pharmacy-[a-zA-Z0-9_-]+\.sqlite3$/.test(name);

class BackupManager {
  constructor({db, databaseFile, backupDir}) {
    this.db = db;
    this.databaseFile = path.resolve(databaseFile);
    this.backupDir = path.resolve(backupDir);
  }
  configurationFrom(file, expected) {
    if (expected === null) return null;
    const copy = new Database(file,{readonly:true,fileMustExist:true});
    try {
      const output = {};
      for(const key of Object.keys(expected)) {
        const row = copy.prepare('SELECT value_json FROM Settings WHERE key=?').get(key);
        output[key] = row ? JSON.parse(row.value_json) : expected[key];
      }
      return output;
    } finally { copy.close(); }
  }
  async create({label='manual',retentionDays=30,configuration=null,pruneAfter=true}={}) {
    if(!this.db?.open) throw Error('Open SQLite database is required');
    fs.mkdirSync(this.backupDir,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const safe=String(label).replace(/[^a-z0-9_-]/gi,'-').slice(0,40)||'manual';
    const file=path.join(this.backupDir,`pharmacy-${stamp}-${safe}.sqlite3`), configFile=`${file}.config.json`;
    try {
      await this.db.backup(file);
      const integrity=this.inspect(file);
      if(integrity.quickCheck!=='ok') throw Error('Backup integrity check failed');
      const archivedConfiguration=this.configurationFrom(file,configuration);
      if(archivedConfiguration!==null) fs.writeFileSync(configFile,JSON.stringify({version:1,settings:archivedConfiguration},null,2),{flag:'wx',mode:0o600});
      const manifest={version:3,createdAt:new Date().toISOString(),source:path.basename(this.databaseFile),file:path.basename(file),sha256:sha256(file),bytes:fs.statSync(file).size,schemaMigrations:integrity.schemaMigrations,migrationVersions:integrity.migrationVersions,quickCheck:integrity.quickCheck,configuration:archivedConfiguration!==null?{file:path.basename(configFile),sha256:sha256(configFile)}:null};
      fs.writeFileSync(`${file}.json`,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
      if(pruneAfter)this.prune(retentionDays);
      return{file,manifestFile:`${file}.json`,manifest};
    } catch(error) {
      for(const candidate of[file,`${file}.json`,configFile])if(fs.existsSync(candidate))fs.rmSync(candidate);
      throw error;
    }
  }
  resolveBackup(nameOrFile) {
    const name=path.basename(String(nameOrFile));
    if(!backupName(name)||name!==String(nameOrFile)&&path.resolve(String(nameOrFile))!==path.join(this.backupDir,name))throw Error('Choose a valid backup from the configured backup directory');
    return path.join(this.backupDir,name);
  }
  verify(nameOrFile,{allowedMigrationVersions=null}={}) {
    const resolved=this.resolveBackup(nameOrFile),manifestFile=`${resolved}.json`;
    if(!fs.existsSync(resolved)||!fs.existsSync(manifestFile))throw Error('Backup or manifest was not found');
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    if(manifest.file!==path.basename(resolved)||manifest.sha256!==sha256(resolved))throw Error('Backup checksum mismatch');
    let configuration=null;
    if(manifest.configuration){
      const configFile=path.join(this.backupDir,manifest.configuration.file);
      if(configFile!==`${resolved}.config.json`||!fs.existsSync(configFile)||sha256(configFile)!==manifest.configuration.sha256)throw Error('Configuration archive checksum mismatch');
      configuration=JSON.parse(fs.readFileSync(configFile,'utf8'));
      if(configuration.version!==1||!configuration.settings||typeof configuration.settings!=='object')throw Error('Configuration archive is invalid');
    }
    const integrity=this.inspect(resolved);
    if(integrity.quickCheck!=='ok')throw Error('Backup integrity check failed');
    if(integrity.schemaMigrations!==manifest.schemaMigrations)throw Error('Backup schema manifest mismatch');
    if(manifest.migrationVersions&&JSON.stringify(manifest.migrationVersions)!==JSON.stringify(integrity.migrationVersions))throw Error('Backup migration manifest mismatch');
    if(allowedMigrationVersions){
      const allowed=new Set(allowedMigrationVersions);
      if(integrity.migrationVersions.some(version=>!allowed.has(version)))throw Error('Backup was created by a newer or incompatible application version');
    }
    return{valid:true,file:resolved,manifest,integrity,configuration};
  }
  list(options={}) {
    if(!fs.existsSync(this.backupDir))return[];
    return fs.readdirSync(this.backupDir).filter(backupName).sort().reverse().map(name=>{
      try{const item=this.verify(name,options);return{name,createdAt:item.manifest.createdAt,bytes:item.manifest.bytes,valid:true,schemaMigrations:item.integrity.schemaMigrations,hasConfiguration:Boolean(item.configuration)};}
      catch(error){return{name,createdAt:null,bytes:fs.statSync(path.join(this.backupDir,name)).size,valid:false,error:String(error.message||error).slice(0,160),schemaMigrations:null,hasConfiguration:false};}
    });
  }
  restoreOffline({backupFile,targetFile,databaseClosed=false,allowedMigrationVersions=null}) {
    if(!databaseClosed)throw Error('Database must be closed before restore');
    const verified=this.verify(backupFile,{allowedMigrationVersions}),target=path.resolve(targetFile);
    if(target===verified.file)throw Error('Backup and restore target must be different');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const recoveryDir=path.join(this.backupDir,'recovery');fs.mkdirSync(recoveryDir,{recursive:true});
    const safety=path.join(recoveryDir,`pre-restore-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite3`);
    const temp=`${target}.restore-${process.pid}-${Date.now()}`;
    let targetRemoved=false;
    try{
      if(fs.existsSync(target)){
        fs.copyFileSync(target,safety,fs.constants.COPYFILE_EXCL);
        if(this.inspect(safety).quickCheck!=='ok')throw Error('Pre-restore safety copy failed integrity check');
      }
      fs.copyFileSync(verified.file,temp);
      const tempCheck=this.inspect(temp);
      if(tempCheck.quickCheck!=='ok'||tempCheck.schemaMigrations!==verified.integrity.schemaMigrations)throw Error('Restored copy failed integrity check');
      if(sha256(temp)!==verified.manifest.sha256)throw Error('Restored copy checksum mismatch');
      for(const suffix of['-wal','-shm'])if(fs.existsSync(target+suffix))fs.rmSync(target+suffix);
      if(fs.existsSync(target)){fs.rmSync(target);targetRemoved=true;}
      fs.renameSync(temp,target);
      targetRemoved=false;
      if(sha256(target)!==verified.manifest.sha256)throw Error('Restored database reconciliation failed');
      return{restored:true,target,safetyFile:fs.existsSync(safety)?safety:null,sha256:sha256(target),backup:verified};
    }catch(error){
      if((targetRemoved||!fs.existsSync(target))&&fs.existsSync(safety))fs.copyFileSync(safety,target);
      throw error;
    }finally{if(fs.existsSync(temp))fs.rmSync(temp);}
  }
  inspect(file){const check=new Database(file,{readonly:true,fileMustExist:true});try{const migrationVersions=check.prepare('SELECT version FROM SchemaMigrations ORDER BY version').all().map(row=>row.version);return{quickCheck:check.pragma('quick_check',{simple:true}),schemaMigrations:migrationVersions.length,migrationVersions};}finally{check.close();}}
  prune(days){const cutoff=Date.now()-Math.max(1,Number(days)||30)*86400000;if(!fs.existsSync(this.backupDir))return;for(const item of fs.readdirSync(this.backupDir)){if(!/^pharmacy-.*\.sqlite3(\.json|\.config\.json)?$/.test(item))continue;const file=path.join(this.backupDir,item);if(fs.statSync(file).mtimeMs<cutoff)fs.rmSync(file);}}
}
module.exports={BackupManager,sha256,backupName};
