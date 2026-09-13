const {ProductMaster}=require('./product-master.cjs');
const {ProductUnitsRepository}=require('../../infrastructure/sqlite/repositories/product-units');
const sealed=new Set(['box','pack','bottle','sachet','injection','vial','ampoule','tube','inhaler','device','capsule']);
class Packing {
 constructor(db){this.db=db;this.master=new ProductMaster(db);this.tx=db.transaction((input,userId)=>this.write(input,userId));}
 detail(id){const result=this.master.detail(id);const locked=Boolean(this.db.prepare('SELECT 1 FROM ProductBatches WHERE product_id=? LIMIT 1').get(id)||this.db.prepare('SELECT 1 FROM InventoryMovements WHERE product_id=? LIMIT 1').get(id)||this.db.prepare('SELECT 1 FROM SaleItems WHERE product_id=? LIMIT 1').get(id)||this.db.prepare('SELECT 1 FROM PurchaseItems WHERE product_id=? LIMIT 1').get(id));return {...result,historyLocked:locked};}
 save(input,userId){return this.tx(input,userId);}
 write(input,userId){
  const before=this.detail(input.id),p=before.product;
  if(p.updatedAt!==input.updatedAt)throw Error('Product changed. Close and reopen packing.');
  if(!Array.isArray(input.units)||!input.units.length||input.units.length>20)throw Error('Configure between 1 and 20 units');
  const names=new Set();
  const units=input.units.map(u=>{
   if(typeof u.unitName!=='string'||!/^[a-z][a-z0-9 -]{0,29}$/.test(u.unitName.trim().toLowerCase()))throw Error('Unit name must use letters, numbers or spaces');
   const name=u.unitName.trim().toLowerCase();if(names.has(name))throw Error('Unit names must be unique');names.add(name);
   if(typeof u.baseQuantity!=='number'||!Number.isFinite(u.baseQuantity)||u.baseQuantity<=0||u.baseQuantity>1000000)throw Error('Base quantity must be positive and at most 1000000');
   if(!Number.isSafeInteger(u.sellingPriceMinor)||u.sellingPriceMinor<0||u.sellingPriceMinor>100000000000)throw Error('Unit price must be non-negative minor units within the supported limit');
   if(typeof u.isDefaultSaleUnit!=='boolean'||typeof u.allowsFractionalQuantity!=='boolean')throw Error('Unit flags must be true or false');
   const lastWord=name.split(/[ -]/).at(-1).replace(/s$/,'');
   if((sealed.has(name)||sealed.has(lastWord))&&u.allowsFractionalQuantity)throw Error('Sealed units and capsules cannot have fractional sale quantity');
   return {unitName:name,baseQuantity:u.baseQuantity,sellingPriceMinor:Math.round(u.sellingPriceMinor/100)*100,isDefaultSaleUnit:u.isDefaultSaleUnit,allowsFractionalQuantity:u.allowsFractionalQuantity};
  });
  const base=units.find(u=>u.unitName===p.baseUnit);if(!base||base.baseQuantity!==1)throw Error('Include the existing base unit with quantity exactly 1');
  if(before.historyLocked)for(const old of before.units){const now=units.find(u=>u.unitName===old.unit_name);if(!now||Math.abs(now.baseQuantity-old.base_quantity)>1e-10)throw Error('Existing unit names and ratios are locked because this product has stock or history');}
  const saved=new ProductUnitsRepository(this.db).configure(input.id,units);
  const now=new Date(Math.max(Date.now(),Date.parse(p.updatedAt)+1)).toISOString();
  this.db.prepare('UPDATE Products SET default_sale_price_minor=?,strip_sale_price_minor=?,box_sale_price_minor=?,updated_by=?,updated_at=? WHERE id=?').run(base.sellingPriceMinor,units.find(u=>u.unitName==='strip')?.sellingPriceMinor??null,units.find(u=>u.unitName==='box')?.sellingPriceMinor??null,userId,now,input.id);
  this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,previous_json,new_json,device_id) VALUES (?,?,'product.packing','product',?,?,?,'modern-desktop')").run(now,userId,String(input.id),JSON.stringify(before.units),JSON.stringify(saved));
  return this.detail(input.id);
 }
}
module.exports={Packing};
