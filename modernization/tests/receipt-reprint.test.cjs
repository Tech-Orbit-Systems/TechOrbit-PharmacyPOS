const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P042 stores and reprints an immutable complete 80mm receipt snapshot',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);
  const gateway=new Gateway(db,{demo:true});
  await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  db.prepare("UPDATE Settings SET value_json=? WHERE key='receiptProfile'").run(JSON.stringify({pharmacyName:'Care Pharmacy & Wellness Centre',address:'12 Main Boulevard, Lahore',phone:'042-111-222-333',taxRegistration:'NTN 1234567-8',footer:'Get well soon'}));
  db.prepare("UPDATE Users SET display_name='Original Cashier' WHERE id=?").run(gateway.session.id);
  db.prepare("UPDATE Products SET name=?,tax_status='taxable',gst_rate_basis_points=1700 WHERE barcode='0012345678901'").run('Extra Long Medicine Name 500 mg Extended Release Tablets');
  const first=await gateway.call('barcode',{barcode:'0012345678901'}),second=await gateway.call('barcode',{barcode:'0012345678903'});
  const input={key:`TO-${randomUUID()}`,paymentMethod:'cash',creditMode:'paid',cashTenderedMinor:1000000,warningAcknowledged:true,invoiceDiscountType:'fixed',invoiceDiscountValue:100,items:[{productId:first.id,saleUnit:first.units[0].unit_name,quantity:2,unitPriceMinor:first.units[0].selling_price_minor,discountType:'fixed',discountValue:50},{productId:second.id,saleUnit:second.units[0].unit_name,quantity:1,unitPriceMinor:second.units[0].selling_price_minor,discountType:'fixed',discountValue:0}]};
  const posted=await gateway.call('post',input);
  assert.equal(posted.profile.pharmacyName,'Care Pharmacy & Wellness Centre');
  assert.equal(posted.cashier.name,'Original Cashier');
  assert.equal(posted.items.length,2);
  assert.ok(posted.totals.gstMinor>0);
  assert.ok(posted.payment.cashChangeMinor>0);
  db.prepare("UPDATE Settings SET value_json=? WHERE key='receiptProfile'").run(JSON.stringify({pharmacyName:'Changed Pharmacy'}));
  db.prepare("UPDATE Users SET display_name='Changed Cashier' WHERE id=?").run(gateway.session.id);
  db.prepare("UPDATE Products SET name='Changed Product' WHERE id=?").run(first.id);
  const detail=await gateway.call('invoiceDetail',{id:posted.saleId});
  assert.equal(detail.receipt.profile.pharmacyName,'Care Pharmacy & Wellness Centre');
  assert.equal(detail.receipt.cashier.name,'Original Cashier');
  assert.equal(detail.receipt.items[0].productName,'Extra Long Medicine Name 500 mg Extended Release Tablets');
  assert.deepEqual(detail.receipt.items.map(item=>item.lineNumber),[1,2]);
  assert.equal(Object.hasOwn(detail.receipt.items[0],'batchId'),false);
  const historical=await gateway.call('invoiceDetail',{id:db.prepare("SELECT id FROM Sales WHERE invoice_number='DEMO-3'").get().id});
  assert.equal(historical.receipt.version,1);
  assert.equal(historical.receipt.cashier.name,'Demo Pharmacist');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM SaleReceiptSnapshots').get().count,db.prepare('SELECT COUNT(*) count FROM Sales').get().count);
 }finally{db.close();}
});
