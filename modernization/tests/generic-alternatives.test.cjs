const {test}=require('node:test'),assert=require('node:assert/strict'),bcrypt=require('bcrypt');
const {openDatabase}=require('../../infrastructure/sqlite/database');const {seedDemo}=require('../desktop/demo.cjs');const {Gateway}=require('../desktop/gateway.cjs');
test('P031 alternatives enforce permission, valid matching stock and explicit audited selection',async()=>{
 const db=openDatabase({filename:':memory:'});try{seedDemo(db);const g=new Gateway(db,{demo:true});await g.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});const source=await g.call('barcode',{barcode:'0012345678901'});
 const result=await g.call('alternativeSearch',{productId:source.id});assert.equal(result.items.length,1);assert.equal(result.items[0].name,'Paracetamol Health 500 mg');assert.equal(db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE action='medicine.alternatives.view'").get().n,1);
 const selected=await g.call('alternativeSelect',{sourceProductId:source.id,alternativeProductId:result.items[0].id});assert.equal(selected.id,result.items[0].id);assert.equal(db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE action='medicine.alternatives.select'").get().n,1);
 db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE username='demo'").run();await assert.rejects(g.call('alternativeSearch',{productId:source.id}),/role/);
 const role=db.prepare("SELECT id FROM Roles WHERE code='pharmacist'").get();db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,active,must_change_password,created_at,updated_at) VALUES('pharm',?,'Pharmacist',?,1,0,datetime('now'),datetime('now'))").run(bcrypt.hashSync('Pharmacist-Test-2026!',10),role.id);await g.call('logout');await g.call('login',{username:'pharm',password:'Pharmacist-Test-2026!'});assert.equal((await g.call('alternativeSearch',{productId:source.id})).items.length,1);
 }finally{db.close()}
});
