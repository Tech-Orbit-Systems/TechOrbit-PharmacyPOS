const fs = require('fs');
const path = require('path');
const {BackupManager} = require('./backup-manager');

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
class DailyBackup {
  constructor({db, databaseFile, backupDir, settings, now = () => new Date(), manager, freeBytes, intervalMs = 60000}) {
    this.db = db;
    this.databaseFile = databaseFile;
    this.backupDir = path.resolve(backupDir);
    this.settings = settings;
    this.now = now;
    this.manager = manager || new BackupManager({db, databaseFile, backupDir});
    this.freeBytes = freeBytes || (() => { const disk = fs.statfsSync(this.backupDir); return disk.bavail * disk.bsize; });
    this.intervalMs = intervalMs;
    this.stateFile = path.join(this.backupDir, 'daily-backup-state.json');
    this.running = false;
    this.timer = null;
    this.state = {lastSuccess:null, lastFailure:null};
    if (fs.existsSync(this.stateFile)) {
      try { const saved = JSON.parse(fs.readFileSync(this.stateFile,'utf8')); this.state = {lastSuccess:saved.lastSuccess || null, lastFailure:saved.lastFailure || null}; }
      catch { this.state.lastFailure = {at:this.now().toISOString(), message:'Backup status file unreadable'}; }
    }
  }
  persist() {
    fs.mkdirSync(this.backupDir,{recursive:true});
    const temp = `${this.stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(this.state,null,2),{mode:0o600});
    fs.renameSync(temp,this.stateFile);
  }
  status() {
    let freeBytes = null;
    try { fs.mkdirSync(this.backupDir,{recursive:true}); freeBytes = this.freeBytes(); } catch {}
    return {...this.state, running:this.running, freeBytes, backupDirectory:this.backupDir, scheduleTime:this.settings().backupScheduleTime};
  }
  async tick() {
    if(this.running) return this.status();
    const now = this.now(), day = localDay(now), preferences = this.settings();
    // First launch catches up immediately; after a success, only one per local day at/after schedule.
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
    const alreadyCovered = this.state.lastSuccess?.day === day;
    const beforeSchedule = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` < preferences.backupScheduleTime;
    const recentFailure = this.state.lastFailure && now.getTime() - new Date(this.state.lastFailure.at).getTime() < 15*60000;
    if(alreadyCovered || recentFailure || (beforeSchedule && this.state.lastSuccess?.day === localDay(yesterday))) return this.status();
    this.running = true;
    try {
      fs.mkdirSync(this.backupDir,{recursive:true});
      const sourceBytes = fs.statSync(this.databaseFile).size;
      if(this.freeBytes() < Math.max(sourceBytes * 2, 100 * 1024 * 1024)) throw Error('Insufficient free space for backup');
      const result = await this.manager.create({label:`daily-${day}`,retentionDays:preferences.backupRetentionDays,configuration:preferences});
      this.manager.verify(result.file);
      this.state.lastSuccess = {day,at:this.now().toISOString(),file:path.basename(result.file),bytes:result.manifest.bytes};
      this.state.lastFailure = null;
      this.persist();
    } catch(error) {
      this.state.lastFailure = {at:this.now().toISOString(),message:String(error.message || error).slice(0,240)};
      this.persist();
    } finally { this.running = false; }
    return this.status();
  }
  async createNow() {
    if(this.running) throw Error('A backup is already running');
    this.running=true;
    try{
      const preferences=this.settings();
      fs.mkdirSync(this.backupDir,{recursive:true});
      const sourceBytes=fs.statSync(this.databaseFile).size;
      if(this.freeBytes()<Math.max(sourceBytes*2,100*1024*1024))throw Error('Insufficient free space for backup');
      const result=await this.manager.create({label:'manual',retentionDays:preferences.backupRetentionDays,configuration:preferences});
      this.manager.verify(result.file);
      this.state.lastSuccess={day:localDay(this.now()),at:this.now().toISOString(),file:path.basename(result.file),bytes:result.manifest.bytes};
      this.state.lastFailure=null;this.persist();
      return this.state.lastSuccess;
    }catch(error){this.state.lastFailure={at:this.now().toISOString(),message:String(error.message||error).slice(0,240)};this.persist();throw error;}
    finally{this.running=false;}
  }
  start() {
    if(this.timer) return;
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); },this.intervalMs);
    this.timer.unref?.();
  }
  stop() { if(this.timer) clearInterval(this.timer); this.timer = null; }
}
module.exports = {DailyBackup,localDay};
