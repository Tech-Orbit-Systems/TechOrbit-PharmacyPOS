const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P043 reconciles an uncertain post by stable reference without duplicating the sale',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    seedDemo(db);
    const gateway=new Gateway(db,{demo:true});
    await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
    const product=await gateway.call('barcode',{barcode:'0012345678901'});
    const input={
      key:'TO-43000000-1234-1234-1234-123456789abc',
      paymentMethod:'digital',
      warningAcknowledged:true,
      invoiceDiscountType:'fixed',
      invoiceDiscountValue:0,
      customerId:null,
      items:[{productId:product.id,saleUnit:'Strip',quantity:1,unitPriceMinor:12000,discountType:'fixed',discountValue:0,overrideBatchId:null,overrideReason:''}],
    };
    assert.deepEqual(await gateway.call('saleRecovery',{key:input.key}),{status:'not_found'});
    const before=db.prepare('SELECT COUNT(*) count FROM Sales').get().count;
    const posted=await gateway.call('post',input);
    const recovered=await gateway.call('saleRecovery',{key:input.key});
    assert.equal(recovered.status,'posted');
    assert.equal(recovered.receipt.saleId,posted.saleId);
    assert.equal(recovered.receipt.invoiceNumber,input.key);
    const retry=await gateway.call('post',input);
    assert.equal(retry.saleId,posted.saleId);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM Sales').get().count,before+1);
    await assert.rejects(gateway.call('saleRecovery',{key:'bad-reference'}),/Invalid sale reference/);
  }finally{db.close();}
});
