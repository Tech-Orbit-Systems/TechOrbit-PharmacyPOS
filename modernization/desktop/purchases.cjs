const crypto=require('crypto');
const {SuppliersRepository}=require('../../infrastructure/sqlite/repositories/suppliers');
const {PurchaseReceivingService}=require('../../infrastructure/sqlite/services/purchase-receiving');
const text=(value,max,label,required=false)=>{if(value!=null&&typeof value!=='string')throw Error(label+' must be text');const v=(value||'').trim();if((required&&!v)||v.length>max)throw Error(label+(required?' is required':' is too long'));return v||null};
const number=(value,label,{integer=false,positive=false}={})=>{if(typeof value!=='number'||!Number.isFinite(value)||(integer&&!Number.isSafeInteger(value))||(positive?value<=0:value<0))throw Error('Enter a valid '+label);return value};
class PurchasesDesktop{
 constructor(db){this.db=db;this.repo=new SuppliersRepository(db);this.postTx=db.transaction((input,user)=>this.postInternal(input,user));}
 suppliers(input={}){const q=text(input.q,100,'Search')||'',pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';return this.db.prepare(`SELECT s.id,s.name,s.phone,s.email,s.address,s.active,
   (SELECT COUNT(*) FROM Purchases p WHERE p.supplier_id=s.id) purchase_count,
   (SELECT COALESCE(SUM(py.balance_minor),0) FROM Payables py WHERE py.supplier_id=s.id AND py.balance_minor>0) balance_minor
   FROM Suppliers s WHERE (?='' OR s.name LIKE ? ESCAPE '\\' OR s.phone LIKE ? ESCAPE '\\') ORDER BY s.active DESC,s.name COLLATE NOCASE,s.id LIMIT 200`).all(q,pattern,pattern);}
 saveSupplier(input,user){const name=text(input.name,200,'Supplier name',true),phone=text(input.phone,50,'Phone'),email=text(input.email,200,'Email'),address=text(input.address,500,'Address');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid supplier email');
  const before=input.id?this.repo.findById(input.id):null,result=this.repo.save({id:input.id,name,phone,email,address,active:input.active!==false});
  this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,previous_json,new_json,device_id) VALUES(?,?,?,?,?,?,?,?,?)")
   .run(new Date().toISOString(),user.id,user.roleCode,before?'supplier.update':'supplier.create','supplier',String(result.id),before?JSON.stringify(before):null,JSON.stringify(result),'modern-desktop');return result;}
 products(input={}){const q=text(input.q,100,'Search')||'',pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';return this.db.prepare(`SELECT p.id,p.name,p.generic_name,p.product_type,p.base_unit,p.default_sale_price_minor,
   json_group_array(json_object('unitName',u.unit_name,'baseQuantity',u.base_quantity,'sellingPriceMinor',u.selling_price_minor,'default',u.is_default_sale_unit)) units
   FROM Products p JOIN ProductUnits u ON u.product_id=p.id WHERE p.active=1 AND (?='' OR p.name LIKE ? ESCAPE '\\' OR p.generic_name LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')
   GROUP BY p.id ORDER BY p.name COLLATE NOCASE LIMIT 50`).all(q,pattern,pattern,pattern,pattern).map(row=>({...row,units:JSON.parse(row.units)}));}
 normalize(input){
  const supplierId=number(input.supplierId,'supplier',{integer:true,positive:true});if(!this.db.prepare('SELECT 1 FROM Suppliers WHERE id=? AND active=1').get(supplierId))throw Error('Select an active supplier');
  const invoiceNumber=text(input.invoiceNumber,100,'Invoice number',true),purchasedAt=text(input.purchasedAt,40,'Purchase date',true);if(Number.isNaN(Date.parse(purchasedAt)))throw Error('Choose a valid purchase date');
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>100)throw Error('Add between 1 and 100 purchase lines');
  const paymentMethod=input.paymentMethod;if(!['cash','card','bank_transfer','mobile_wallet','other','credit'].includes(paymentMethod))throw Error('Choose a valid payment method');
  const items=input.items.map((item,index)=>({productId:number(item.productId,'product',{integer:true,positive:true}),purchaseUnit:text(item.purchaseUnit,30,'Unit',true),
   purchasedQuantity:number(item.purchasedQuantity,'purchased quantity',{positive:true}),bonusQuantity:number(item.bonusQuantity,'bonus quantity'),unitCostMinor:number(item.unitCostMinor,'unit cost',{integer:true}),
   salePriceMinor:number(item.salePriceMinor,'selling price',{integer:true}),batchNumber:text(item.batchNumber,100,'Batch number'),expiryDate:text(item.expiryDate,20,'Expiry'),manufacturingDate:text(item.manufacturingDate,20,'Manufacturing date'),updateSellingPrice:item.updateSellingPrice===true,line:index+1}));
  const amountPaidMinor=number(input.amountPaidMinor,'amount paid',{integer:true}),dueDate=text(input.dueDate,10,'Due date'),notes=text(input.notes,500,'Notes');
  if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Error('Due date must use YYYY-MM-DD');
  return{supplierId,invoiceNumber,purchasedAt,paymentMethod,amountPaidMinor,dueDate,notes,items,idempotencyKey:text(input.idempotencyKey,80,'Purchase reference',true)};
 }
 preview(input){const normalized=this.normalize(input);const service=new PurchaseReceivingService(this.db),lines=normalized.items.map(item=>{const n=service.normalizeItem(item);return{line:item.line,productId:n.productId,name:n.product.name,purchaseUnit:n.purchaseUnit,purchasedQuantity:n.purchasedQuantity,bonusQuantity:n.bonusQuantity,baseQuantityReceived:n.baseQuantityReceived,lineTotalMinor:n.lineTotalMinor,effectiveUnitCostMinor:n.effectiveUnitCostMinor,batchNumber:n.batchNumber,expiryDate:n.expiryDate}});const totalMinor=lines.reduce((sum,x)=>sum+x.lineTotalMinor,0);if(normalized.amountPaidMinor>totalMinor)throw Error('Amount paid cannot exceed purchase total');if(totalMinor-normalized.amountPaidMinor>0&&!normalized.dueDate)throw Error('Due date is required when a balance remains');return{...normalized,lines,totalMinor,balanceDueMinor:totalMinor-normalized.amountPaidMinor};}
 post(input,user){return this.postTx(input,user)}
 postInternal(input,user){const p=this.preview(input),fingerprint=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),old=this.db.prepare('SELECT id,request_fingerprint FROM Purchases WHERE idempotency_key=?').get(p.idempotencyKey);if(old){if(old.request_fingerprint!==fingerprint)throw Error('Purchase reference was already used with different details');const saved=this.detail({id:Number(old.id)});return{purchaseId:saved.id,totalMinor:saved.total_minor,amountPaidMinor:saved.amount_paid_minor,balanceDueMinor:saved.balance_due_minor,items:saved.items,idempotent:true}};
  const result=new PurchaseReceivingService(this.db).receive({...p,createdBy:user.id,roleCode:user.roleCode,deviceId:'modern-desktop',reason:'Purchase received in desktop'});this.db.prepare('UPDATE Purchases SET request_fingerprint=? WHERE id=?').run(fingerprint,result.purchaseId);
  for(const item of p.items)if(item.updateSellingPrice){this.db.prepare('UPDATE ProductUnits SET selling_price_minor=? WHERE product_id=? AND unit_name=? COLLATE NOCASE').run(item.salePriceMinor,item.productId,item.purchaseUnit);const unit=this.db.prepare('SELECT is_default_sale_unit FROM ProductUnits WHERE product_id=? AND unit_name=? COLLATE NOCASE').get(item.productId,item.purchaseUnit);if(unit?.is_default_sale_unit)this.db.prepare('UPDATE Products SET default_sale_price_minor=?,updated_at=? WHERE id=?').run(item.salePriceMinor,new Date().toISOString(),item.productId)}
  return{...result,idempotent:false};}
 history(input={}){const supplierId=input.supplierId==null?null:number(input.supplierId,'supplier',{integer:true,positive:true});return this.db.prepare(`SELECT p.id,p.invoice_number,p.purchased_at,p.total_minor,p.amount_paid_minor,p.balance_due_minor,p.payment_method,p.due_date,s.name supplier_name,COUNT(pi.id) item_count
   FROM Purchases p JOIN Suppliers s ON s.id=p.supplier_id LEFT JOIN PurchaseItems pi ON pi.purchase_id=p.id WHERE (? IS NULL OR p.supplier_id=?) GROUP BY p.id ORDER BY p.purchased_at DESC,p.id DESC LIMIT 100`).all(supplierId,supplierId);}
 detail(input){const id=number(input.id,'purchase',{integer:true,positive:true}),purchase=this.db.prepare(`SELECT p.*,s.name supplier_name FROM Purchases p JOIN Suppliers s ON s.id=p.supplier_id WHERE p.id=?`).get(id);if(!purchase)throw Error('Purchase was not found');purchase.items=this.db.prepare(`SELECT pi.*,pr.name product_name,pb.batch_number,pb.expiry_date FROM PurchaseItems pi JOIN Products pr ON pr.id=pi.product_id JOIN ProductBatches pb ON pb.id=pi.batch_id WHERE pi.purchase_id=? ORDER BY pi.id`).all(id);return purchase;}
}
module.exports={PurchasesDesktop};
