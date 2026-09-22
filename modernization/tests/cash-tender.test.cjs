const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P040 validates cash tender, saves change and records only the sale total as money received',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    seedDemo(db);const gateway=new Gateway(db,{demo:true});await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
    const product=await gateway.call('barcode',{barcode:'0012345678903'}),unit=product.units[0];
    const make=(key=`TO-${randomUUID()}`)=>({key,paymentMethod:'cash',creditMode:'paid',customerId:null,invoiceDiscountType:'fixed',invoiceDiscountValue:0,warningAcknowledged:true,items:[{productId:product.id,saleUnit:unit.unit_name,quantity:1,unitPriceMinor:unit.selling_price_minor,discountType:'fixed',discountValue:0,overrideBatchId:null,overrideReason:''}]});
    const base=make(),quote=await gateway.call('quote',base);assert.equal(quote.finalTotalMinor,5000);
    await assert.rejects(gateway.call('post',{...base,cashTenderedMinor:4999}),/at least the final total/);assert.equal(db.prepare('SELECT COUNT(*) count FROM Sales WHERE idempotency_key=?').get(base.key).count,0);
    const exactInput={...make(),cashTenderedMinor:5000},exact=await gateway.call('post',exactInput);assert.equal(exact.payment.cashChangeMinor,0);
    const overInput={...make(),cashTenderedMinor:10000},over=await gateway.call('post',overInput);assert.equal(over.payment.cashTenderedMinor,10000);assert.equal(over.payment.cashChangeMinor,5000);
    const saved=db.prepare('SELECT final_total_minor,amount_paid_minor,cash_tendered_minor,cash_change_minor FROM Sales WHERE id=?').get(over.saleId);assert.deepEqual(saved,{final_total_minor:5000,amount_paid_minor:5000,cash_tendered_minor:10000,cash_change_minor:5000});
    assert.equal(db.prepare("SELECT amount_minor FROM MoneyMovements WHERE reference_type='sale' AND reference_id=?").get(String(over.saleId)).amount_minor,5000);
    const audit=JSON.parse(db.prepare("SELECT new_json FROM AuditLog WHERE action='sale.post' AND entity_id=?").get(String(over.saleId)).new_json);assert.equal(audit.cashTenderedMinor,10000);assert.equal(audit.cashChangeMinor,5000);
  }finally{db.close();}
});
