const fs = require('fs');
const os = require('os');
const path = require('path');
const {openDatabase} = require('../infrastructure/sqlite/database');
const {DailyBackup} = require('../infrastructure/backup/daily-backup');
const {BackupManager} = require('../infrastructure/backup/backup-manager');

describe('P066 daily backup', () => {
  let dir, databaseFile, db, now, scheduler;
  const settings = () => ({backupScheduleTime:'22:00', backupRetentionDays:7, invoicePrefix:'TO'});
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(),'to-daily-backup-'));
    databaseFile = path.join(dir,'pharmacy.sqlite3');
    db = openDatabase({filename:databaseFile});
    now = new Date('2026-10-05T08:00:00');
  });
  afterEach(() => {scheduler?.stop(); if(db?.open) db.close(); fs.rmSync(dir,{recursive:true,force:true});});
  const make = (options = {}) => new DailyBackup({db,databaseFile,backupDir:path.join(dir,'backups'),settings,now:()=>now,freeBytes:()=>500*1024*1024,...options});
  test('first startup catches up, captures WAL and configuration once, persists health', async () => {
    db.prepare("INSERT INTO Suppliers(name,created_at,updated_at) VALUES ('WAL Supplier',datetime('now'),datetime('now'))").run();
    scheduler = make();
    await scheduler.tick();
    const status = scheduler.status();
    expect(status.lastSuccess.day).toBe('2026-10-05');
    expect(status.lastFailure).toBeNull();
    const file = path.join(dir,'backups',status.lastSuccess.file);
    const verified = new BackupManager({db,databaseFile,backupDir:path.join(dir,'backups')}).verify(file);
    expect(verified.manifest.configuration.sha256).toHaveLength(64);
    expect(JSON.parse(fs.readFileSync(`${file}.config.json`,'utf8')).settings).toEqual(settings());
    const copied = openDatabase({filename:file});
    expect(copied.prepare('SELECT name FROM Suppliers WHERE name=?').get('WAL Supplier').name).toBe('WAL Supplier');
    copied.close();
    await scheduler.tick();
    expect(fs.readdirSync(path.join(dir,'backups')).filter(name=>name.endsWith('.sqlite3'))).toHaveLength(1);
    const reloaded = make();
    expect(reloaded.status().lastSuccess.day).toBe('2026-10-05');
  });
  test('missed day catches up and retention removes an old backup triplet', async () => {
    scheduler = make(); await scheduler.tick();
    const old = path.join(dir,'backups',scheduler.status().lastSuccess.file);
    const oldTime = new Date('2026-09-01T00:00:00');
    for(const file of [old,`${old}.json`,`${old}.config.json`]) fs.utimesSync(file,oldTime,oldTime);
    now = new Date('2026-10-07T08:00:00');
    await scheduler.tick();
    expect(scheduler.status().lastSuccess.day).toBe('2026-10-07');
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(`${old}.json`)).toBe(false);
    expect(fs.existsSync(`${old}.config.json`)).toBe(false);
  });
  test('space failure is visible and never overwrites last good backup', async () => {
    scheduler = make(); await scheduler.tick();
    const good = scheduler.status().lastSuccess;
    now = new Date('2026-10-06T22:01:00');
    scheduler.freeBytes = () => 0;
    await scheduler.tick();
    expect(scheduler.status().lastSuccess).toEqual(good);
    expect(scheduler.status().lastFailure.message).toMatch(/space/i);
    expect(fs.existsSync(path.join(dir,'backups',good.file))).toBe(true);
  });
  test('configuration tampering fails verification', async () => {
    scheduler = make(); await scheduler.tick();
    const file = path.join(dir,'backups',scheduler.status().lastSuccess.file);
    fs.appendFileSync(`${file}.config.json`,'tampered');
    expect(() => scheduler.manager.verify(file)).toThrow(/Configuration archive checksum/);
  });
});
