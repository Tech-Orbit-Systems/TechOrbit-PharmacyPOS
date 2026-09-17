const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P032 inventory gateway paginates, filters, protects cost and enforces access',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);
  const gateway=new Gateway(db,{demo:true});
  await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const result=await gateway.call('inventoryList',{q:'Panadol',stock:'all',expiry:'all',page:1});
  assert.equal(result.costVisible,true);assert.ok(result.total>=2);assert.ok(result.items.every(row=>row.name.includes('Panadol')));
  const detail=await gateway.call('inventoryDetail',{batchId:result.items[0].id});
  assert.equal(detail.batch.id,result.items[0].id);assert.ok(detail.movements.length>0);assert.equal(typeof detail.batch.stockValueMinor,'number');
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='manager') WHERE username='demo'").run();
  const protectedResult=await gateway.call('inventoryList',{q:'Panadol',stock:'all',expiry:'all',page:1});
  assert.equal(protectedResult.costVisible,false);assert.equal(protectedResult.items[0].effectiveCostMinor,null);
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE username='demo'").run();
  await assert.rejects(gateway.call('inventoryList',{q:'',stock:'all',expiry:'all',page:1}),/role/);
 }finally{db.close()}
});

