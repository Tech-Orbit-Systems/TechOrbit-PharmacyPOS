const {test}=require('node:test'),assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../infrastructure/sqlite/database');const {seedDemo}=require('../desktop/demo.cjs');const {Gateway}=require('../desktop/gateway.cjs');
test('P030 packing preserves history, stock and sale snapshots; validates units, roles and rollback',async()=>{
 const db=openDatabase({filename:':memory:'});try{seedDemo(db);const g=new Gateway(db,{demo:true});await g.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
 const product=await g.call('barcode',{barcode:'0012345678901'});let detail=await g.call('packingDetail',{id:product.id});assert.equal(detail.historyLocked,true);
 const map=d=>d.units.map(u=>({unitName:u.unit_name,baseQuantity:u.base_quantity,sellingPriceMinor:u.selling_price_minor,isDefaultSaleUnit:Boolean(u.is_default_sale_unit),allowsFractionalQuantity:Boolean(u.allows_fractional_quantity)}));
 let units=map(detail);const payload=()=>({id:product.id,updatedAt:detail.product.updatedAt,units});
 await assert.rejects(g.call('packingSave',{...payload(),units:units.map(u=>({...u,baseQuantity:u.baseQuantity*2}))}),/base unit|locked/);
 await assert.rejects(g.call('packingSave',{...payload(),units:units.filter(u=>u.unitName!=='tablet')}),/locked/);
 units=units.map(u=>({...u,isDefaultSaleUnit:false}));units.push({unitName:'test pack',baseQuantity:20,sellingPriceMinor:220050,isDefaultSaleUnit:true,allowsFractionalQuantity:false});
 const stock=()=>db.prepare('SELECT SUM(quantity_on_hand) n FROM ProductBatches WHERE product_id=?').get(product.id).n;
 const before=stock();const old=payload();detail=await g.call('packingSave',old);assert.equal(stock(),before);assert.equal(detail.units.find(u=>u.unit_name==='test pack').selling_price_minor,220100);await assert.rejects(g.call('packingSave',old),/changed/);
 const input={key:'TO-'+randomUUID(),paymentMethod:'cash',discountMinor:0,items:[{productId:product.id,saleUnit:'test pack',quantity:1}]};const receipt=await g.call('post',input);assert.equal(receipt.totals.finalTotalMinor,220100);assert.equal(stock(),before-20);
 const snapshot=db.prepare("SELECT * FROM SaleItems WHERE sale_unit='test pack'").get();assert.equal(snapshot.base_quantity,20);
 units=map(detail).map(u=>({...u,sellingPriceMinor:u.unitName==='test pack'?230000:u.sellingPriceMinor}));detail=await g.call('packingSave',payload());assert.deepEqual(db.prepare('SELECT * FROM SaleItems WHERE id=?').get(snapshot.id),snapshot);
 for(const patch of [{baseQuantity:0},{sellingPriceMinor:-1},{allowsFractionalQuantity:'yes'}]){const invalid=map(detail);invalid[0]={...invalid[0],...patch};await assert.rejects(g.call('packingSave',{id:product.id,updatedAt:detail.product.updatedAt,units:invalid}));}
 const bad=map(detail);bad.push({unitName:'bottle',baseQuantity:2,sellingPriceMinor:100,isDefaultSaleUnit:false,allowsFractionalQuantity:true});await assert.rejects(g.call('packingSave',{id:product.id,updatedAt:detail.product.updatedAt,units:bad}),/Sealed/);
 const duplicate=map(detail);duplicate.push({...duplicate[0]});await assert.rejects(g.call('packingSave',{id:product.id,updatedAt:detail.product.updatedAt,units:duplicate}),/unique/);
 const original=await g.call('packingDetail',{id:product.id});db.exec("CREATE TRIGGER reject_packing BEFORE INSERT ON AuditLog WHEN NEW.action='product.packing' BEGIN SELECT RAISE(ABORT,'fixture'); END");await assert.rejects(g.call('packingSave',{id:product.id,updatedAt:detail.product.updatedAt,units:map(detail)}));assert.deepEqual(await g.call('packingDetail',{id:product.id}),original);db.exec('DROP TRIGGER reject_packing');
 await assert.rejects(g.call('quote',{...input,key:'TO-'+randomUUID(),items:[{productId:product.id,saleUnit:'test pack',quantity:0.5}]}),/Fractional/);
 db.prepare("UPDATE Users SET role_id=(SELECT id FROM Roles WHERE code='cashier') WHERE username='demo'").run();for(const command of ['packingDetail','packingSave'])await assert.rejects(g.call(command,{id:product.id}),/role/);
 }finally{db.close()}
});
