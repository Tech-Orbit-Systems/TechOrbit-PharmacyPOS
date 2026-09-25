const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P039 requires warning acknowledgement and preserves optional prescription trace',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    seedDemo(db);
    const gateway=new Gateway(db,{demo:true});
    await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
    db.prepare('UPDATE Products SET prescription_required=1,controlled_medicine=1 WHERE barcode=?').run('0012345678901');
    const product=await gateway.call('barcode',{barcode:'0012345678901'}),unit=product.units[0];
    const input={key:`TO-${randomUUID()}`,paymentMethod:'cash',creditMode:'paid',cashTenderedMinor:1000000,customerId:null,invoiceDiscountType:'fixed',invoiceDiscountValue:0,items:[{productId:product.id,saleUnit:unit.unit_name,quantity:1,unitPriceMinor:unit.selling_price_minor,discountType:'fixed',discountValue:0,overrideBatchId:null,overrideReason:''}]};
    const quote=await gateway.call('quote',input);
    assert.deepEqual(new Set(quote.warnings.map(x=>x.type)),new Set(['near_expiry','prescription','controlled']));
    await assert.rejects(gateway.call('post',input),/Acknowledge all medicine and expiry warnings/);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM Sales WHERE idempotency_key=?').get(input.key).count,0);
    const receipt=await gateway.call('post',{...input,warningAcknowledged:true,doctorName:'Dr Sana',prescriptionReference:'RX-P039-001'});
    assert.equal(receipt.warningAcknowledgement.doctorName,'Dr Sana');
    assert.equal(receipt.warningAcknowledgement.prescriptionReference,'RX-P039-001');
    assert.equal(receipt.warningAcknowledgement.acknowledgedBy,'Demo Pharmacist');
    const saved=db.prepare('SELECT * FROM SaleWarningAcknowledgements WHERE sale_id=?').get(receipt.saleId);
    assert.equal(saved.acknowledged_by,gateway.session.id);
    assert.equal(JSON.parse(saved.warnings_json).length,3);
    const audit=JSON.parse(db.prepare("SELECT new_json FROM AuditLog WHERE action='sale.post' AND entity_id=?").get(String(receipt.saleId)).new_json);
    assert.equal(audit.warningAcknowledgement.prescriptionReference,'RX-P039-001');
  }finally{db.close();}
});
