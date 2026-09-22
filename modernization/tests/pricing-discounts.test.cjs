const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P037 quotes and posts edited price plus line and invoice discounts with an audited safe replay',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});
  await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const product=await gateway.call('barcode',{barcode:'0012345678901'}),unit=product.units[0];
  const original=unit.selling_price_minor,charged=original+345;
  const input={key:`TO-${randomUUID()}`,paymentMethod:'cash',creditMode:'paid',customerId:null,invoiceDiscountType:'percentage',invoiceDiscountValue:10,items:[{productId:product.id,saleUnit:unit.unit_name,quantity:2,unitPriceMinor:charged,discountType:'fixed',discountValue:100}]};
  const quote=await gateway.call('quote',input);
  assert.equal(quote.items[0].originalUnitPriceMinor,original);assert.equal(quote.items[0].chargedUnitPriceMinor,charged);
  assert.equal(quote.items[0].grossMinor,charged*2);assert.equal(quote.items[0].lineDiscountMinor,100);
  assert.equal(quote.invoiceDiscountMinor,Math.round((charged*2-100)*.1));assert.equal(quote.finalTotalMinor%100,0);
  const receipt=await gateway.call('post',input);assert.equal(receipt.items[0].originalUnitPriceMinor,original);assert.equal(receipt.items[0].unitPriceMinor,charged);
  assert.equal(receipt.totals.lineDiscountMinor,100);assert.equal(receipt.totals.invoiceDiscountMinor,quote.invoiceDiscountMinor);
  const replay=await gateway.call('post',input);assert.equal(replay.saleId,receipt.saleId);
  await assert.rejects(gateway.call('post',{...input,items:[{...input.items[0],unitPriceMinor:charged+1}]}),/different details/);
  const row=db.prepare('SELECT original_unit_price_minor,charged_unit_price_minor,line_discount_type,line_discount_value FROM SaleItems WHERE sale_id=?').get(receipt.saleId);
  assert.deepEqual(row,{original_unit_price_minor:original,charged_unit_price_minor:charged,line_discount_type:'fixed',line_discount_value:100});
  const audit=JSON.parse(db.prepare("SELECT new_json FROM AuditLog WHERE action='sale.post' AND entity_id=?").get(String(receipt.saleId)).new_json);
  assert.equal(audit.invoiceDiscountType,'percentage');assert.equal(audit.pricing[0].originalUnitPriceMinor,original);assert.equal(audit.pricing[0].chargedUnitPriceMinor,charged);
  db.prepare("DELETE FROM UserPermissions WHERE user_id=? AND permission_id=(SELECT id FROM Permissions WHERE code='sale.price_edit')").run(gateway.session.id);
  db.prepare("DELETE FROM RolePermissions WHERE role_id=(SELECT role_id FROM Users WHERE id=?) AND permission_id=(SELECT id FROM Permissions WHERE code='sale.price_edit')").run(gateway.session.id);
  await assert.rejects(gateway.call('quote',{...input,key:`TO-${randomUUID()}`}),/does not allow/i);
 }finally{db.close()}
});
