const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P041 searches paged invoices and exposes authorized saved-invoice actions',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const all=await gateway.call('invoiceSearch',{page:1});assert.equal(all.pageSize,25);assert.ok(all.total>25);assert.equal(all.items.length,25);
  const byInvoice=await gateway.call('invoiceSearch',{invoiceNumber:'DEMO-3',page:1});assert.ok(byInvoice.items.some(row=>row.invoice_number==='DEMO-3'));
  const byProduct=await gateway.call('invoiceSearch',{product:'Panadol',page:1});assert.ok(byProduct.items.length>0);
  const byPhone=await gateway.call('invoiceSearch',{phone:'03001234567',paymentStatus:'credit',page:1});assert.equal(byPhone.items.length,1);
  const detail=await gateway.call('invoiceDetail',{id:byPhone.items[0].id});assert.equal(detail.invoiceNumber,'DEMO-3');assert.equal(detail.customer.phone,'03001234567');assert.ok(detail.items[0].productName.includes('Panadol'));assert.ok(detail.receivable);assert.deepEqual(detail.actions,{canPrint:true,canViewCustomerHistory:true,canStartReturn:true,canViewAudit:true});assert.ok(detail.audit.some(row=>row.action==='sale.post'));
  const history=await gateway.call('customerHistory',{phone:'03001234567'});assert.equal(history.items.length,1);
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE id=?").run(gateway.session.id);const cashier=await gateway.call('invoiceDetail',{id:byPhone.items[0].id});assert.equal(cashier.actions.canStartReturn,false);assert.equal(cashier.actions.canViewAudit,false);assert.equal(cashier.audit.length,0);
 }finally{db.close()}
});
