const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P036 supplier and purchase gateway posts bonus stock, payable, price and safe replay',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});
  await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const supplier=await gateway.call('supplierSave',{name:'P036 Distributor',phone:'03001230000',email:'p036@example.com',address:'Lahore',active:true});
  const product=(await gateway.call('purchaseProducts',{q:'Panadol'}))[0];
  const input={supplierId:supplier.id,invoiceNumber:'P036-INV-1',purchasedAt:'2026-09-19T12:00:00.000+05:00',paymentMethod:'bank_transfer',amountPaidMinor:5000,dueDate:'2026-10-19',notes:'P036 receiving',idempotencyKey:'TO-11111111-1111-4111-8111-111111111111',items:[{productId:product.id,purchaseUnit:'Strip',purchasedQuantity:2,bonusQuantity:1,unitCostMinor:5000,salePriceMinor:13000,batchNumber:'P036-B1',expiryDate:'09/2028',manufacturingDate:'09/2026',updateSellingPrice:true}]};
  const preview=await gateway.call('purchasePreview',input);assert.equal(preview.totalMinor,10000);assert.equal(preview.balanceDueMinor,5000);assert.equal(preview.lines[0].baseQuantityReceived,3);assert.equal(preview.lines[0].effectiveUnitCostMinor,3333);
  const result=await gateway.call('purchasePost',input);assert.equal(result.idempotent,false);assert.equal(result.balanceDueMinor,5000);
  const replay=await gateway.call('purchasePost',input);assert.equal(replay.idempotent,true);assert.equal(replay.purchaseId,result.purchaseId);assert.equal(replay.balanceDueMinor,5000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchases WHERE invoice_number=?').get('P036-INV-1').n,1);
  assert.equal(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE batch_number=?').get('P036-B1').quantity_on_hand,3);
  assert.equal(db.prepare("SELECT selling_price_minor FROM ProductUnits WHERE product_id=? AND lower(unit_name)='strip'").get(product.id).selling_price_minor,13000);
  assert.equal(db.prepare("SELECT balance_minor FROM Payables WHERE source_type='purchase' AND source_id=?").get(String(result.purchaseId)).balance_minor,5000);
  await assert.rejects(gateway.call('purchasePost',{...input,amountPaidMinor:4000}),/different details/);
  const detail=await gateway.call('purchaseDetail',{id:result.purchaseId});assert.equal(detail.items[0].bonus_quantity,1);
  assert.equal((await gateway.call('supplierList',{q:'P036'})).find(x=>x.id===supplier.id).balance_minor,5000);
 }finally{db.close()}
});
