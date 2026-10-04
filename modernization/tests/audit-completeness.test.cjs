const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P065 master changes are atomic with protected audit facts and actor context',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);
  const gateway=new Gateway(db,{demo:true});
  const actor=await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  db.exec("CREATE TRIGGER p065_fail_audit BEFORE INSERT ON AuditLog WHEN NEW.action='supplier.create' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END");
  await assert.rejects(gateway.call('supplierSave',{name:'Atomic Supplier',phone:'03001234567',email:'private@example.com',address:'Private street',active:true}),/Purchase could not be saved|Injected audit failure/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM Suppliers WHERE name='Atomic Supplier'").get().n,0);
  db.exec('DROP TRIGGER p065_fail_audit');
  const supplier=await gateway.call('supplierSave',{name:'Atomic Supplier',phone:'03001234567',email:'private@example.com',address:'Private street',active:true});
  const vendor=await gateway.call('vendorSave',{name:'Atomic Vendor',phone:'03002223333',active:true});
  const customer=await gateway.call('createCustomer',{name:'Private Customer',phone:'03003334444'});
  for(const [action,id] of [['supplier.create',supplier.id],['vendor.save',vendor.id],['customer.create',customer.id]]){
    const row=db.prepare('SELECT a.*,ac.role_code snapshot_role,ac.reason snapshot_reason FROM AuditLog a JOIN AuditEventContext ac ON ac.audit_id=a.id WHERE a.action=? AND a.entity_id=? ORDER BY a.id DESC LIMIT 1').get(action,String(id));
    assert.equal(row.user_id,actor.id);
    assert.equal(row.snapshot_role,'admin');
    assert.ok(row.snapshot_reason);
    assert.ok(row.occurred_at.endsWith('Z'));
    assert.ok(row.entity_id);
    assert.ok(!`${row.previous_json||''}${row.new_json||''}`.includes('0300'));
    assert.ok(!`${row.previous_json||''}${row.new_json||''}`.includes('private@example.com'));
  }
 }finally{db.close()}
});
