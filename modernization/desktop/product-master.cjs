const { ProductsRepository } = require('../../infrastructure/sqlite/repositories/products');
const { ProductUnitsRepository } = require('../../infrastructure/sqlite/repositories/product-units');
const text = (v, max, label, required=false) => {
  if (v != null && typeof v !== 'string') throw Error(label+' must be text');
  const s=(v||'').trim(); if ((required&&!s)||s.length>max) throw Error(label+' is required or too long'); return s||null;
};
const num = (v, label, integer=false) => { if(typeof v!=='number'||!Number.isFinite(v)||v<0||(integer&&!Number.isSafeInteger(v)))throw Error(label+' must be a non-negative '+(integer?'integer':'number'));return v; };
const fields={name:'name',barcode:'barcode',genericName:'generic_name',manufacturer:'manufacturer',category:'category',productType:'product_type',dosageForm:'dosage_form',strength:'strength',packDescription:'pack_description',baseUnit:'base_unit',defaultSalePriceMinor:'default_sale_price_minor',boxSalePriceMinor:'box_sale_price_minor',stripSalePriceMinor:'strip_sale_price_minor',minimumStock:'minimum_stock',reorderLevel:'reorder_level',defaultSupplierId:'default_supplier_id',prescriptionRequired:'prescription_required',controlledMedicine:'controlled_medicine',gstRateBasisPoints:'gst_rate_basis_points',taxStatus:'tax_status',active:'active',notes:'notes'};
class ProductMaster {
 constructor(db){this.db=db;this.repo=new ProductsRepository(db);this.saveTx=db.transaction((input,userId)=>this.saveInternal(input,userId));}
 list(input={}){
  const q=text(input.q,100,'Search')||'',state=input.state||'active',page=Number(input.page||1);
  if(!['active','inactive','all'].includes(state)||!Number.isSafeInteger(page)||page<1)throw Error('Invalid product filter');
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const where=`(?='all' OR active=?) AND (name LIKE ? ESCAPE '\\' OR generic_name LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')`;
  const args=[state,state==='active'?1:0,pattern,pattern,pattern,pattern];
  const total=this.db.prepare(`SELECT COUNT(*) n FROM Products WHERE ${where}`).get(...args).n;
  const items=this.db.prepare(`SELECT id,sku,name,barcode,generic_name,manufacturer,strength,base_unit,default_sale_price_minor,active FROM Products WHERE ${where} ORDER BY name COLLATE NOCASE,id LIMIT 25 OFFSET ?`).all(...args,(page-1)*25);
  return {items,total,page,pageSize:25};
 }
 detail(id){if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid product ID');const p=this.repo.findById(id);if(!p)throw Error('Product not found');const value={id:p.id,sku:p.sku,updatedAt:p.updated_at};for(const [key,column]of Object.entries(fields))value[key]=p[column];for(const k of ['active','prescriptionRequired','controlledMedicine'])value[k]=Boolean(value[k]);return{product:value,units:new ProductUnitsRepository(this.db).list(id)};}
 suppliers(){return this.db.prepare('SELECT id,name FROM Suppliers WHERE active=1 ORDER BY name COLLATE NOCASE,id').all();}
 normalize(input){
  const p={};for(const k of ['name','barcode','genericName','manufacturer','category','dosageForm','strength','packDescription','baseUnit','productType','taxStatus','notes'])p[k]=text(input[k],k==='notes'?2000:k==='name'?200:k==='barcode'?100:200,k,['name','baseUnit','productType','taxStatus'].includes(k));
  p.baseUnit=p.baseUnit.toLowerCase();if(!/^[a-z][a-z0-9 -]{0,29}$/.test(p.baseUnit))throw Error('Base unit must use letters, numbers or spaces');
  if(!['medicine','general','cosmetic','device','other'].includes(p.productType))throw Error('Invalid product type');
  if(!['taxable','exempt'].includes(p.taxStatus))throw Error('Invalid tax status');
  for(const k of ['defaultSalePriceMinor','minimumStock','reorderLevel','gstRateBasisPoints'])p[k]=num(input[k],k,k.endsWith('Minor')||k==='gstRateBasisPoints');
  for(const k of ['boxSalePriceMinor','stripSalePriceMinor'])p[k]=input[k]==null?null:num(input[k],k,true);
  for(const unit of ['box','strip'])if(p.baseUnit===unit&&p[unit+'SalePriceMinor']!==null&&p[unit+'SalePriceMinor']!==p.defaultSalePriceMinor)throw Error('When '+unit+' is the base unit, its selling price must match the base selling price');
  if(p.gstRateBasisPoints>10000)throw Error('GST cannot exceed 100 percent');if(p.taxStatus==='exempt')p.gstRateBasisPoints=0;
  for(const k of ['active','prescriptionRequired','controlledMedicine']){if(typeof input[k]!=='boolean')throw Error(k+' must be true or false');p[k]=input[k];}
  p.defaultSupplierId=input.defaultSupplierId??null;if(p.defaultSupplierId!==null&&(!Number.isSafeInteger(p.defaultSupplierId)||!this.db.prepare('SELECT 1 FROM Suppliers WHERE id=? AND active=1').get(p.defaultSupplierId)))throw Error('Select an active supplier');
  return p;
 }
 save(input,userId){return this.saveTx(input,userId);}
 saveInternal(input,userId){
  const p=this.normalize(input),existing=input.id?this.detail(input.id).product:null;
  const key=existing?.sku||String(input.createKey||'');if(!existing&&!/^TO-[0-9a-f-]{36}$/.test(key))throw Error('Invalid product creation reference');
  if(!existing){const prior=this.db.prepare('SELECT id FROM Products WHERE sku=?').get(key);if(prior){const saved=this.detail(prior.id).product;if(Object.keys(fields).every(k=>(saved[k]??null)===(p[k]??null)))return{...this.detail(prior.id),replayed:true};throw Error('Creation reference was already used with different values');}}
  if(existing&&existing.updatedAt!==input.updatedAt)throw Error('Product changed since you opened it. Close and reopen the editor.');
  if(existing&&existing.baseUnit!==p.baseUnit)throw Error('Existing base unit cannot be changed here; historical stock must not be rebased');
  const duplicate=p.barcode&&this.db.prepare('SELECT id FROM Products WHERE barcode=? AND id<>?').get(p.barcode,existing?.id||0);if(duplicate)throw Error('Barcode is already assigned to another product');
  const duplicates=p.active?this.repo.findActiveNameDuplicates(p.name).filter(x=>x.id!==existing?.id):[];
  if(duplicates.length&&!input.confirmDuplicateName)return{needsConfirmation:true,duplicates};
  const before=existing?this.repo.findById(existing.id):null;let id;
  if(existing){id=existing.id;const now=new Date(Math.max(Date.now(),Date.parse(existing.updatedAt)+1)).toISOString();const values=Object.keys(fields).map(k=>typeof p[k]==='boolean'?Number(p[k]):p[k]);this.db.prepare(`UPDATE Products SET ${Object.values(fields).map(k=>k+'=?').join(',')},updated_by=?,updated_at=? WHERE id=?`).run(...values,userId,now,id);}
  else {id=this.repo.create({...p,sku:key,createdBy:userId}).id;new ProductUnitsRepository(this.db).configure(id,[{unitName:p.baseUnit,baseQuantity:1,sellingPriceMinor:p.defaultSalePriceMinor,isDefaultSaleUnit:true,allowsFractionalQuantity:false}]);}
  // Keep visible product price fields and matching unit price definitions coherent.
  for(const [unit,price]of [[p.baseUnit,p.defaultSalePriceMinor],['box',p.boxSalePriceMinor],['strip',p.stripSalePriceMinor]])if(price!==null)this.db.prepare('UPDATE ProductUnits SET selling_price_minor=? WHERE product_id=? AND unit_name=?').run(price,id,unit);
  const after=this.repo.findById(id);this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,previous_json,new_json,device_id) VALUES (?,?,?,'product',?,?,?,'modern-desktop')").run(new Date().toISOString(),userId,existing?'product.update':'product.create',String(id),before?JSON.stringify(before):null,JSON.stringify(after));
  return this.detail(id);
 }
}
module.exports={ProductMaster};
