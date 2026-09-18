const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P033 desktop opening stock previews manual and CSV rows, commits atomically and locks per product',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const products=await gateway.call('openingStockProducts',{q:'Cetirizine'});assert.equal(products.length,1);assert.equal(products[0].locked,false);
  const manual=await gateway.call('openingStockPreviewManual',{productId:products[0].id,entryDate:'2026-09-18',batchNumber:'MAN-1',expiryDate:'12/2028',unit:'Strip',quantity:2,unitCost:10,notes:'Manual fixture'});
  assert.equal(manual.errorRows,0);assert.equal(manual.rows[0].normalized.expiryDate,'2028-12-31');
  assert.equal((await gateway.call('openingStockCommit',{jobId:manual.jobId})).committedRows,1);
  const stored=db.prepare("SELECT opening_quantity FROM ProductBatches WHERE product_id=? AND batch_number='MAN-1'").get(products[0].id);assert.equal(stored.opening_quantity,2);
  assert.equal(db.prepare("SELECT action FROM AuditLog WHERE entity_id=?").get(String(manual.jobId)).action,'opening_stock.manual');
  assert.equal((await gateway.call('openingStockProducts',{q:'Cetirizine'}))[0].locked,true);
  const csv='sku,barcode,entry_date,batch_number,expiry_date,unit,quantity,unit_cost,notes\n,0012345678903,2026-09-18,CSV-1,11/2028,Sachet,4,2.5,CSV fixture\n';
  const imported=await gateway.call('openingStockPreviewFile',{name:'opening.csv',base64:Buffer.from(csv).toString('base64')});assert.equal(imported.errorRows,0);assert.equal(imported.rows[0].normalized.expiryDate,'2028-11-30');
  assert.equal((await gateway.call('openingStockCommit',{jobId:imported.jobId})).committedRows,1);
  const template=await gateway.call('openingStockTemplate');assert.match(template.name,/\.xlsx$/);assert.ok(Buffer.from(template.base64,'base64').length>1000);
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE username='demo'").run();await assert.rejects(gateway.call('openingStockProducts',{q:''}),/role/);
 }finally{db.close()}
});

