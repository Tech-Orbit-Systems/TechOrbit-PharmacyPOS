const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P044 quote is read-only and matches the atomic posted sale totals and FEFO allocation',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    seedDemo(db);
    const gateway=new Gateway(db,{demo:true});
    await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
    const product=await gateway.call('barcode',{barcode:'0012345678901'});
    const unit=product.units.find(value=>value.unit_name.toLowerCase()==='strip');
    const input={
      key:`TO-${randomUUID()}`,paymentMethod:'digital',warningAcknowledged:true,customerId:null,
      invoiceDiscountType:'percentage',invoiceDiscountValue:5,
      items:[{productId:product.id,saleUnit:unit.unit_name,quantity:2,unitPriceMinor:unit.selling_price_minor-500,discountType:'fixed',discountValue:100,overrideBatchId:null,overrideReason:''}],
    };
    const tables=['Sales','SaleItems','SaleItemAllocations','InventoryMovements','MoneyMovements','Receivables','AuditLog','SaleReceiptSnapshots'];
    const counts=()=>Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT COUNT(*) count FROM ${name}`).get().count]));
    const beforeCounts=counts(),beforeStock=db.prepare('SELECT SUM(quantity_on_hand) quantity FROM ProductBatches').get().quantity;
    const quote=await gateway.call('quote',input);
    assert.deepEqual(counts(),beforeCounts);
    assert.equal(db.prepare('SELECT SUM(quantity_on_hand) quantity FROM ProductBatches').get().quantity,beforeStock);
    assert.equal(quote.items[0].allocations.length>0,true);
    const receipt=await gateway.call('post',input);
    assert.deepEqual(receipt.totals,{grossMinor:quote.grossMinor,taxableMinor:quote.taxableMinor,exactTotalMinor:quote.exactTotalMinor,finalTotalMinor:quote.finalTotalMinor,lineDiscountMinor:quote.lineDiscountMinor,gstMinor:quote.gstMinor,roundingMinor:quote.roundingMinor,invoiceDiscountMinor:quote.invoiceDiscountMinor});
    assert.equal(receipt.payment.amountPaidMinor,quote.amountPaidMinor);
    assert.equal(receipt.items[0].unitPriceMinor,quote.items[0].chargedUnitPriceMinor);
    assert.equal(receipt.items[0].lineTotalMinor,quote.items[0].lineTotalMinor);
    const allocations=db.prepare(`SELECT a.batch_id batchId,a.base_quantity quantity FROM SaleItemAllocations a JOIN SaleItems i ON i.id=a.sale_item_id WHERE i.sale_id=? ORDER BY a.id`).all(receipt.saleId);
    assert.deepEqual(allocations,quote.items[0].allocations);
  }finally{db.close();}
});
