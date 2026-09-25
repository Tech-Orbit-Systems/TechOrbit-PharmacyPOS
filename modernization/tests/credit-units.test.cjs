const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');const {seedDemo}=require('../desktop/demo.cjs');const {Gateway}=require('../desktop/gateway.cjs');const {dayKey,addDays}=require('../desktop/ranges.cjs');
test('single/bulk unit pricing and stock, shift, customer, full and partial credit',async()=>{
 const db=openDatabase({filename:':memory:'});try{
  seedDemo(db);const beforeUnits=db.prepare('SELECT COUNT(*) n FROM ProductUnits').get().n;seedDemo(db);assert.equal(db.prepare('SELECT COUNT(*) n FROM ProductUnits').get().n,beforeUnits);
  const g=new Gateway(db,{demo:true});await g.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  assert.ok(await g.call('shiftStatus'));db.prepare("UPDATE CashShifts SET status='closed'").run();assert.equal(await g.call('shiftStatus'),null);
  const p=await g.call('barcode',{barcode:'0012345678901'});assert.deepEqual(p.units.map(u=>u.unit_name).sort(),['box','strip','tablet']);
  const ors=await g.call('barcode',{barcode:'0012345678903'});assert.deepEqual(ors.units.map(u=>u.unit_name).sort(),['box','pack','sachet']);
  const amox=await g.call('barcode',{barcode:'0012345678904'});assert.deepEqual(amox.units.map(u=>u.unit_name).sort(),['box','capsule','strip']);
  const sale=(unit='tablet',quantity=1,extra={})=>{const value={key:'TO-'+crypto.randomUUID(),paymentMethod:'cash',warningAcknowledged:true,discountMinor:0,items:[{productId:p.id,saleUnit:unit,quantity}],...extra};if((value.creditMode||'paid')==='paid'&&value.paymentMethod==='cash')value.cashTenderedMinor=1000000;return value};
  assert.equal((await g.call('quote',sale())).finalTotalMinor,1200);
  assert.equal((await g.call('quote',sale('strip'))).finalTotalMinor,12000);
  assert.equal((await g.call('quote',sale('box'))).finalTotalMinor,120000);
  const stock=()=>db.prepare('SELECT SUM(quantity_on_hand) n FROM ProductBatches WHERE product_id=?').get(p.id).n;
  const before=stock();await g.call('post',sale('tablet',3));assert.ok(Math.abs(before-stock()-.3)<1e-8);
  const c=await g.call('createCustomer',{name:'Credit Test Customer',phone:'+92 301 2345678'});assert.ok(c.id);assert.equal((await g.call('createCustomer',{name:'Credit Test Customer',phone:'03012345678'})).id,c.id);
  await assert.rejects(g.call('createCustomer',{name:'Different Customer',phone:'03012345678'}),/already belongs/);
  await assert.rejects(g.call('createCustomer',{name:'A',phone:'abc'}));
  const dueDate=addDays(dayKey(new Date()),7);
  const full=sale('strip',2,{creditMode:'credit',customerId:c.id,dueDate});const cashBefore=db.prepare('SELECT COUNT(*) n FROM MoneyMovements').get().n;
  const fullQuote=await g.call('quote',full);assert.equal(fullQuote.balanceDueMinor,24000);assert.equal(fullQuote.amountPaidMinor,0);
  const fullResult=await g.call('post',full);assert.equal(fullResult.payment.balanceDueMinor,24000);assert.equal(db.prepare('SELECT COUNT(*) n FROM MoneyMovements').get().n,cashBefore);
  const partial=sale('strip',2,{creditMode:'partial',paidMinor:10000,customerId:c.id,dueDate,paymentMethod:'digital'});
  const partQuote=await g.call('quote',partial);assert.equal(partQuote.balanceDueMinor,14000);
  const partResult=await g.call('post',partial);assert.equal(partResult.payment.amountPaidMinor,10000);assert.equal(partResult.payment.balanceDueMinor,14000);
  assert.equal(db.prepare("SELECT method FROM MoneyMovements WHERE reference_type='sale' AND reference_id=?").get(String(partResult.saleId)).method,'digital');
  assert.equal(db.prepare("SELECT balance_minor FROM Receivables WHERE source_id=? AND source_type='sale'").get(String(partResult.saleId)).balance_minor,14000);
  await assert.rejects(g.call('post',sale('strip',1,{creditMode:'credit',dueDate})),/customer/);
  await assert.rejects(g.call('post',sale('strip',1,{creditMode:'credit',customerId:c.id,dueDate:'2026-02-30'})),/due date/);
  await assert.rejects(g.call('quote',sale('strip',1,{creditMode:'partial',paidMinor:999999})),/exceed/);
  const count=db.prepare('SELECT COUNT(*) n FROM Sales').get().n;await g.call('post',partial);assert.equal(db.prepare('SELECT COUNT(*) n FROM Sales').get().n,count);
  await assert.rejects(g.call('post',{...partial,paymentMethod:'cash'}));
 }finally{db.close()}
});
