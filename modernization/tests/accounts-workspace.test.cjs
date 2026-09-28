const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');
const {PurchaseReceivingService}=require('../../infrastructure/sqlite/services/purchase-receiving');

test('B02 customer paging, unified dues and three settlement types reconcile without duplicates',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const now=new Date().toISOString(),insert=db.prepare('INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES(?,?,?,?,?)');db.transaction(()=>{for(let i=0;i<525;i++)insert.run(`Bulk Customer ${String(i).padStart(3,'0')}`,`0301${String(i).padStart(7,'0')}`,`0301${String(i).padStart(7,'0')}`,now,now)})();
  const first=await gateway.call('customerSearch',{q:'Bulk Customer',page:1,pageSize:25}),last=await gateway.call('customerSearch',{q:'Bulk Customer',page:21,pageSize:25});assert.equal(first.total,525);assert.equal(first.items.length,25);assert.equal(last.items.length,25);assert.notEqual(first.items[0].id,last.items[0].id);
  const customerDue=(await gateway.call('duesList',{type:'customer',status:'open',q:'Ahmed',page:1})).items[0];assert.ok(customerDue.balance_minor>0);const collect={receivableId:customerDue.id,amountMinor:1000,method:'digital',collectedAt:now,reference:'COLL-B02',idempotencyKey:'TO-11111111-1111-1111-1111-111111111111'};const collected=await gateway.call('receivableCollect',collect);assert.equal((await gateway.call('receivableCollect',collect)).idempotent,true);await assert.rejects(gateway.call('receivableCollect',{...collect,amountMinor:1}),/different details/);assert.equal(db.prepare("SELECT COUNT(*) n FROM MoneyMovements WHERE reference_type='receivable_payment'").get().n,1);assert.ok(collected.balanceMinor<customerDue.balance_minor);
  const supplier=db.prepare("SELECT id FROM Suppliers WHERE name='Demo Medical Distributors'").get(),product=db.prepare('SELECT id FROM Products ORDER BY id LIMIT 1').get();new PurchaseReceivingService(db).receive({supplierId:supplier.id,idempotencyKey:'b02-purchase',paymentMethod:'credit',purchasedAt:now,dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10),items:[{productId:product.id,purchasedQuantity:2,unitCostMinor:500,salePriceMinor:1000,batchNumber:'B02-PURCHASE',expiryDate:'2028-12-31'}]});const supplierDue=(await gateway.call('duesList',{type:'supplier',status:'open',q:'Demo Medical',page:1})).items.find(x=>Boolean(x.settleable));assert.ok(supplierDue);const paid=await gateway.call('supplierPay',{payableId:supplierDue.id,amountMinor:supplierDue.balance_minor,method:'bank_transfer',paidAt:now,reference:'SUP-B02',idempotencyKey:'TO-22222222-2222-2222-2222-222222222222'});assert.equal(paid.balanceMinor,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchases WHERE id=?').get(Number(db.prepare('SELECT source_id FROM Payables WHERE id=?').get(supplierDue.id).source_id)).n,1);
  const vendor=await gateway.call('vendorSave',{name:'Utility Vendor',phone:'0420000000',active:true}),category=(await gateway.call('expenseMetadata')).categories[0];const expense=await gateway.call('expensePost',{categoryId:category.id,vendorId:vendor.id,incurredAmountMinor:9000,amountPaidMinor:2000,method:'cash',expenseDate:now,dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10),reference:'EXP-B02',description:'Utility charge',idempotencyKey:'TO-33333333-3333-3333-3333-333333333333'});assert.equal(expense.balanceDueMinor,7000);const vendorDue=(await gateway.call('duesList',{type:'vendor',status:'open',q:'Utility',page:1})).items[0];const vendorPaid=await gateway.call('vendorPay',{payableId:vendorDue.id,amountMinor:7000,method:'card',paidAt:now,reference:'VEN-B02',idempotencyKey:'TO-44444444-4444-4444-4444-444444444444'});assert.equal(vendorPaid.balanceMinor,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM Expenses WHERE reference='EXP-B02'").get().n,1);assert.equal(db.prepare("SELECT SUM(amount_minor) amount FROM MoneyMovements WHERE reference_type IN ('expense','expense_payment')").get().amount,9000);
  assert.equal((await gateway.call('duesHistory',{type:'customer',id:customerDue.id})).length,1);assert.equal((await gateway.call('duesHistory',{type:'supplier',id:supplierDue.id})).length,1);assert.equal((await gateway.call('duesHistory',{type:'vendor',id:vendorDue.id})).length,1);
  const report=await gateway.call('settlementSummary',{range:'7d'});assert.deepEqual(report.totals,{count:3,inMinor:1000,outMinor:8000,netMinor:-7000});
  assert.equal((await gateway.call('settlementSummary',{range:'7d',method:'digital'})).totals.inMinor,1000);
  assert.equal((await gateway.call('settlementEntries',{range:'7d',page:1,pageSize:1})).hasMore,true);
  assert.ok((await gateway.call('settlementExport',{range:'7d',format:'csv'})).csv.includes('"Net cash flow minor","-7000"'));
  assert.equal(Buffer.from((await gateway.call('settlementExport',{range:'7d',format:'xlsx'})).base64,'base64').subarray(0,2).toString(),'PK');
  assert.equal(Buffer.from((await gateway.call('settlementExport',{range:'7d',format:'pdf'})).base64,'base64').subarray(0,4).toString(),'%PDF');
  db.prepare("DELETE FROM RolePermissions WHERE role_id=(SELECT id FROM Roles WHERE code='admin') AND permission_id=(SELECT id FROM Permissions WHERE code='expense.manage')").run();
  assert.equal((await gateway.call('settlementSummary',{range:'7d'})).totals.outMinor,1000);
  await assert.rejects(gateway.call('settlementExport',{range:'7d',type:'vendor',format:'csv'}),/does not allow/);
  db.prepare("UPDATE MoneyMovements SET amount_minor=amount_minor+1 WHERE reference_type='receivable_payment'").run();
  await assert.rejects(gateway.call('settlementSummary',{range:'7d'}),/does not reconcile/);

 }finally{db.close()}
});
