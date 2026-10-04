const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const r=require('../desktop/audit-report.cjs');
test('R031 event counts, Pakistan midnight, sanitized values and exports preserve audit history',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  const insert=db.prepare('INSERT INTO AuditLog(occurred_at,role_code,action,entity_type,entity_id,previous_json,new_json,reason,device_id) VALUES(?,?,?,?,?,?,?,?,?)');
  insert.run('2026-09-27T19:00:00Z','admin','price.edit','product','7',JSON.stringify({priceMinor:100}),JSON.stringify({priceMinor:200,password_hash:'SECRET-HASH',nested:{apiKey:'SECRET-KEY'},phone:'PRIVATE-PHONE'}),'Correct price','COUNTER-A');
  insert.run('2026-09-27T18:59:59Z',null,'settings.change','settings','1',null,JSON.stringify({value:'SECRET-CONFIG'}),null,null);
  const input={range:'custom',from:'2026-09-28',to:'2026-09-28'},options={now:new Date('2026-09-28T12:00:00Z'),costVisible:true};
  const report=r.auditSummary(db,input,options);assert.equal(report.totals.eventCount,1);assert.equal(report.actions[0].count,1);
  assert.match(report.items[0].occurredAtPk,/28\/09\/2026, 00:00:00/);
  assert.ok(report.items[0].previousValue.includes('100'));assert.ok(report.items[0].newValue.includes('200'));
  assert.ok(!JSON.stringify(report).includes('SECRET'));assert.ok(!JSON.stringify(report).includes('PRIVATE-PHONE'));
  assert.ok(r.auditSummary(db,input,{...options,costVisible:false}).items[0].newValue.includes('Redacted'));
  assert.ok(!r.auditSummary(db,input,{...options,costVisible:false}).items[0].newValue.includes('200'));
  assert.equal(r.auditSummary(db,{...input,action:'missing'},options).totals.eventCount,0);
  assert.equal(r.auditSummary(db,{...input,role:'ADMIN',entityId:'7',device:'counter-a'},options).totals.eventCount,1);
  assert.throws(()=>r.auditEntries(db,{...input,page:0},options),/valid report page/);
  assert.equal(r.auditEntries(db,{...input,page:1,pageSize:1},options).items.length,1);
  const csv=r.auditCsv(db,input,options).csv;assert.ok(csv.includes('"Event count","1"'));assert.ok(!csv.includes('SECRET'));
  assert.equal(Buffer.from((await r.auditXlsx(db,input,options)).base64,'base64').subarray(0,2).toString(),'PK');
  assert.equal(Buffer.from(r.auditPdf(db,input,options).base64,'base64').subarray(0,4).toString(),'%PDF');
  assert.ok(!r.auditCsv(db,{...input,from:'2026-09-27'},options).csv.includes('SECRET-CONFIG'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM AuditLog').get().n,2);
  assert.ok(db.prepare('SELECT new_json FROM AuditLog WHERE id=1').get().new_json.includes('SECRET-HASH'));
  assert.throws(()=>db.prepare("UPDATE AuditLog SET action='tamper' WHERE id=1").run(),/Audit history cannot be changed/);
  assert.throws(()=>db.prepare('DELETE FROM AuditLog WHERE id=1').run(),/Audit history cannot be deleted/);
  insert.run('2026-09-27T20:00:00Z','admin','customer.edit','customer','9',null,JSON.stringify({name:'Private Customer',phone:'03001234567'}),'Call 03001234567 or client@example.com; token=TOPSECRET',null);
  const protectedReport=r.auditSummary(db,{range:'custom',from:'2026-09-28',to:'2026-09-28',entity:'customer'},options);
  assert.equal(protectedReport.items[0].reason,'[Protected customer reason]');
  assert.ok(!JSON.stringify(protectedReport).includes('TOPSECRET'));
  assert.ok(!JSON.stringify(protectedReport).includes('03001234567'));
 }finally{db.close()}
});

test('P065 event context snapshots the actor role and routine reason without changing old audit facts',()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  const now='2026-09-28T08:00:00Z';
  const id=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) SELECT 'audit-actor','unused','Audit Actor',id,?,? FROM Roles WHERE code='cashier'").run(now,now).lastInsertRowid);
  const event=Number(db.prepare("INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json) VALUES (?,?,'customer.create','customer','15',?)").run(now,id,JSON.stringify({created:true})).lastInsertRowid);
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='admin') WHERE id=?").run(id);
  const saved=db.prepare('SELECT role_code,reason FROM AuditEventContext WHERE audit_id=?').get(event);
  assert.deepEqual(saved,{role_code:'cashier',reason:'customer.create'});
  const viewed=r.auditSummary(db,{range:'custom',from:'2026-09-28',to:'2026-09-28'},{}).items[0];
  assert.equal(viewed.role,'cashier');
  assert.equal(viewed.reason,'[Protected customer reason]');
  assert.throws(()=>db.prepare("UPDATE AuditEventContext SET role_code='admin' WHERE audit_id=?").run(event),/Audit context cannot be changed/);
 }finally{db.close()}
});
