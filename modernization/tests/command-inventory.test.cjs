const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const methods=require('../desktop/commands.cjs');
const {validateInput}=require('../desktop/ipc-contract.cjs');

test('P064 one command inventory matches the renderer API and contains no duplicate names',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/contracts.ts'),'utf8');
  const api=source.match(/export interface Api \{([\s\S]*?)\n\}\n(?:declare global|export interface)/)?.[1];
  assert.ok(api,'renderer API interface exists');
  const declared=[...api.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\(/gm)].map(match=>match[1]);
  assert.deepEqual([...new Set(methods)].sort(),[...new Set(declared)].sort());
  assert.equal(methods.length,new Set(methods).size);
  assert.ok(Object.isFrozen(methods));
});

test('P064 IPC rejects malformed account commands and dangerous nested values before dispatch',()=>{
  const valid={username:'cashier',displayName:'Cashier One',roleCode:'cashier'};
  assert.deepEqual(validateInput('userCreate',valid),valid);
  for(const value of [
    {...valid,unexpected:true},
    {...valid,roleCode:'owner'},
    {...valid,displayName:4},
    {...valid,username:'x'.repeat(41)},
  ])assert.throws(()=>validateInput('userCreate',value),/Invalid request payload/);
  assert.throws(()=>validateInput('usersList',{id:1}),/Invalid request payload/);
  assert.throws(()=>validateInput('userDetail',{id:0}),/Invalid request payload/);
  assert.throws(()=>validateInput('unlistedCommand',{}),/Invalid request payload/);
  const malicious=JSON.parse('{"safe":{"__proto__":{"polluted":true}}}');
  assert.throws(()=>validateInput('dashboard',malicious),/Invalid request payload/);
  assert.throws(()=>validateInput('dashboard',{range:'today\u0000'}),/Invalid request payload/);
  assert.throws(()=>validateInput('dashboard',{range:Number.POSITIVE_INFINITY}),/Invalid request payload/);
  assert.throws(()=>validateInput('dashboard',{range:'today',unexpected:'x'}),/Invalid request payload/);
  assert.throws(()=>validateInput('purchaseDetail',{id:'1'}),/Invalid request payload/);
  assert.throws(()=>validateInput('purchasePost',{supplierId:1,items:[{productId:1,unexpected:true}]}),/Invalid request payload/);
  assert.deepEqual(validateInput('invoiceSearch',{invoiceNumber:'TO-1',page:1,phone:undefined}),{invoiceNumber:'TO-1',page:1,phone:undefined});
  assert.throws(()=>validateInput('invoiceSearch',{pageSize:1001}),/Invalid request payload/);
  assert.throws(()=>validateInput('invoiceSearch',{phone:'x'.repeat(4097)}),/Invalid request payload/);
  assert.throws(()=>validateInput('productImportInspect',{name:'../stock.csv',base64:'YWJj'}),/Invalid request payload/);
  assert.throws(()=>validateInput('productImportInspect',{name:'stock.csv',base64:'not base64'}),/Invalid request payload/);
  assert.deepEqual(validateInput('productImportInspect',{name:'stock.csv',base64:'YWJj'}),{name:'stock.csv',base64:'YWJj'});
});

test('P064 every command has a generated runtime schema from the renderer contract',()=>{
  const schemas=require('../desktop/ipc-schemas.json');
  assert.deepEqual(Object.keys(schemas).sort(),[...methods].sort());
  assert.equal(schemas.dashboard.kind,'object');
  assert.equal(schemas.post.properties.items.schema.kind,'array');
  assert.equal(schemas.userCreate.properties.roleCode.schema.kind,'string');
});
