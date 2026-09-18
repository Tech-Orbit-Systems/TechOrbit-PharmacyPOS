const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P034 desktop product import maps CSV, previews errors, preserves identifiers and commits atomically',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const gateway=new Gateway(db,{demo:true});await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const source='Product Name,Product Barcode,Price,Kind\nP034 Product,0000340001,25.5,general\n',file={name:'p034.csv',base64:Buffer.from(source).toString('base64')};
  const inspected=await gateway.call('productImportInspect',file);assert.equal(inspected.totalRows,1);assert.deepEqual(inspected.headers,['product name','product barcode','price','kind']);
  const mapping={name:'product name',barcode:'product barcode',base_sale_price:'price',product_type:'kind'};
  const preview=await gateway.call('productImportPreview',{...file,mapping,duplicatePolicy:'error'});assert.equal(preview.errorRows,0);assert.equal(preview.rows[0].normalized.barcode,'0000340001');
  const committed=await gateway.call('productImportCommit',{jobId:preview.jobId});assert.equal(committed.committedRows,1);assert.equal(db.prepare("SELECT barcode FROM Products WHERE name='P034 Product'").get().barcode,'0000340001');
  const duplicateFile={name:'p034-duplicate.csv',base64:Buffer.from(source+'\n').toString('base64')};const duplicate=await gateway.call('productImportPreview',{...duplicateFile,mapping,duplicatePolicy:'skip'});assert.equal(duplicate.skippedRows,1);assert.equal((await gateway.call('productImportCommit',{jobId:duplicate.jobId})).committedRows,0);
  const badSource='name,barcode\n,=CMD()\n',badFile={name:'bad.csv',base64:Buffer.from(badSource).toString('base64')};const bad=await gateway.call('productImportPreview',{...badFile,mapping:{name:'name',barcode:'barcode'},duplicatePolicy:'error'});assert.equal(bad.errorRows,1);const errors=await gateway.call('productImportErrors',{jobId:bad.jobId});const errorCsv=Buffer.from(errors.base64,'base64').toString();assert.match(errorCsv,/name is required/);assert.match(errorCsv,/""barcode"":""=CMD\(\)""/);
  const template=await gateway.call('productImportTemplate');assert.match(template.name,/\.xlsx$/);assert.ok(Buffer.from(template.base64,'base64').length>1000);
  db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE username='demo'").run();await assert.rejects(gateway.call('productImportInspect',file),/role/);
 }finally{db.close()}
});
