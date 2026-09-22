const { roundPayableToRupee } = require("../../domain/utils");

const METHODS = new Set(["cash","card","digital","bank_transfer","mobile_wallet","other","credit"]);

class SalesPostingService {
  constructor(db) { this.db=db; this.postTransaction=db.transaction((sale)=>this.postInternal(sale)); }
  post(sale) {
    if (!sale?.invoiceNumber?.trim()) throw new Error("Invoice number is required");
    if (!sale.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    if (!Array.isArray(sale.items)||sale.items.length===0) throw new Error("At least one sale item is required");
    return this.postTransaction(sale);
  }
  postInternal(sale) {
    const soldAt=sale.soldAt||new Date().toISOString(); const saleDate=soldAt.slice(0,10);
    const method=sale.paymentMethod||"cash"; if(!METHODS.has(method)) throw new Error("Unsupported payment method");
    const items=sale.items.map((item,index)=>this.normalizeItem(item,index+1,sale.roleCode));
    const grossMinor=items.reduce((s,i)=>s+i.grossMinor,0); const lineDiscountMinor=items.reduce((s,i)=>s+i.lineDiscountMinor,0);
    const afterLine=grossMinor-lineDiscountMinor; const invoiceDiscountMinor=this.discountAmount(afterLine,sale.invoiceDiscountType,sale.invoiceDiscountValue||0);
    if(invoiceDiscountMinor>afterLine) throw new Error("Invoice discount cannot exceed invoice amount");
    let allocated=0;
    items.forEach((item,index)=>{ item.invoiceDiscountMinor=index===items.length-1?invoiceDiscountMinor-allocated:Math.round(invoiceDiscountMinor*(item.afterLineMinor/afterLine||0)); allocated+=item.invoiceDiscountMinor;
      item.taxableMinor=item.product.tax_status==="taxable"?item.afterLineMinor-item.invoiceDiscountMinor:0;
      item.gstMinor=Math.round(item.taxableMinor*item.product.gst_rate_basis_points/10000);
      item.lineTotalMinor=item.afterLineMinor-item.invoiceDiscountMinor+item.gstMinor; });
    const taxableMinor=items.reduce((s,i)=>s+i.taxableMinor,0); const gstMinor=items.reduce((s,i)=>s+i.gstMinor,0);
    const exactTotalMinor=items.reduce((s,i)=>s+i.lineTotalMinor,0); const finalTotalMinor=roundPayableToRupee(exactTotalMinor);
    const amountPaidMinor=sale.amountPaidMinor==null?(method==="credit"?0:finalTotalMinor):Number(sale.amountPaidMinor);
    if(!Number.isInteger(amountPaidMinor)||amountPaidMinor<0||amountPaidMinor>finalTotalMinor) throw new Error("Amount paid must be between zero and final total");
    const balanceDueMinor=finalTotalMinor-amountPaidMinor;
    const collectionMethod=method==="credit"?(sale.collectionMethod||null):method;
    if(amountPaidMinor>0&&(!collectionMethod||collectionMethod==="credit"||!METHODS.has(collectionMethod))) throw new Error("Actual collection method is required for a partial credit payment");
    if(balanceDueMinor>0){ if(!sale.customerId) throw new Error("Customer is required for partial or credit sale"); if(!sale.dueDate) throw new Error("Due date is required when balance remains"); if(sale.dueDate<saleDate) throw new Error("Due date cannot be earlier than sale date"); }
    const customer=sale.customerId?this.db.prepare("SELECT * FROM Customers WHERE id=? AND active=1").get(sale.customerId):null;
    if(sale.customerId&&!customer) throw new Error("Active customer was not found");
    if(balanceDueMinor>0&&(!customer.name?.trim()||!customer.phone?.trim())) throw new Error("Customer name and phone are required for credit sale");
    const now=new Date().toISOString();
    const saleResult=this.db.prepare(`INSERT INTO Sales
      (invoice_number,idempotency_key,sold_at,customer_id,customer_name_snapshot,customer_phone_snapshot,payment_method,payment_status,
       gross_minor,line_discount_minor,invoice_discount_minor,taxable_minor,gst_minor,exact_total_minor,rounding_minor,final_total_minor,
       amount_paid_minor,balance_due_minor,due_date,cogs_minor,status,created_by,created_at,request_fingerprint)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'posted',?,?,?)`).run(sale.invoiceNumber.trim(),sale.idempotencyKey.trim(),soldAt,
      sale.customerId||null,customer?.name||null,customer?.phone||null,method,balanceDueMinor===0?"paid":amountPaidMinor>0?"partial":"credit",
      grossMinor,lineDiscountMinor,invoiceDiscountMinor,taxableMinor,gstMinor,exactTotalMinor,finalTotalMinor-exactTotalMinor,finalTotalMinor,
      amountPaidMinor,balanceDueMinor,sale.dueDate||null,sale.createdBy||null,now,sale.requestFingerprint||null);
    const saleId=Number(saleResult.lastInsertRowid); let totalCogs=0; const postedItems=[]; const warnings=[];
    for(const item of items){ item.suggestedBatchId=this.suggestedFefoBatchId(item.product.id,saleDate);const allocation=this.allocateFefo(item.product.id,item.baseQuantity,saleDate,item.overrideBatchId); const cogsMinor=allocation.reduce((s,a)=>s+a.cogsMinor,0); totalCogs+=cogsMinor;
      const itemWarnings=[];
      if(item.product.prescription_required)itemWarnings.push({type:'prescription'});
      if(item.product.controlled_medicine)itemWarnings.push({type:'controlled'});
      for(const a of allocation){if(a.batch.expiry_date&&this.daysUntil(saleDate,a.batch.expiry_date)<=90)itemWarnings.push({type:'near_expiry',batchId:a.batch.id,expiryDate:a.batch.expiry_date});}
      warnings.push(...itemWarnings.map(w=>({lineNumber:item.lineNumber,productId:item.product.id,...w})));
      const itemResult=this.db.prepare(`INSERT INTO SaleItems
        (sale_id,line_number,product_id,product_name_snapshot,generic_name_snapshot,sale_unit,entered_quantity,base_quantity,
         original_unit_price_minor,charged_unit_price_minor,gross_minor,line_discount_type,line_discount_value,line_discount_minor,
         allocated_invoice_discount_minor,taxable_minor,gst_rate_basis_points,gst_minor,line_total_minor,cogs_minor,prescription_warning,controlled_warning,near_expiry_warning)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(saleId,item.lineNumber,item.product.id,item.product.name,item.product.generic_name,
        item.saleUnit,item.enteredQuantity,item.baseQuantity,item.originalUnitPriceMinor,item.chargedUnitPriceMinor,item.grossMinor,
        item.lineDiscountType||null,item.lineDiscountValue||0,item.lineDiscountMinor,item.invoiceDiscountMinor,item.taxableMinor,
        item.product.gst_rate_basis_points,item.gstMinor,item.lineTotalMinor,cogsMinor,item.product.prescription_required,item.product.controlled_medicine,itemWarnings.some(w=>w.type==='near_expiry')?1:0);
      const saleItemId=Number(itemResult.lastInsertRowid);
      for(const a of allocation){ this.db.prepare("UPDATE ProductBatches SET quantity_on_hand=quantity_on_hand-?,updated_at=? WHERE id=?").run(a.quantity,now,a.batch.id);
        this.db.prepare(`INSERT INTO SaleItemAllocations(sale_item_id,batch_id,base_quantity,expiry_date_snapshot,unit_cost_minor_snapshot,cogs_minor) VALUES (?,?,?,?,?,?)`).run(saleItemId,a.batch.id,a.quantity,a.batch.expiry_date,a.batch.unit_cost_minor,a.cogsMinor);
        this.db.prepare(`INSERT INTO InventoryMovements(product_id,batch_id,movement_type,quantity_delta,reference_type,reference_id,occurred_at,user_id,note) VALUES (?,?,'sale',?,'sale',?,?,?,?)`).run(item.product.id,a.batch.id,-a.quantity,String(saleId),soldAt,sale.createdBy||null,item.overrideBatchId?`Manual FEFO override: ${item.overrideReason}`:'FEFO allocation'); }
      postedItems.push({saleItemId,lineNumber:item.lineNumber,productId:item.product.id,baseQuantity:item.baseQuantity,originalUnitPriceMinor:item.originalUnitPriceMinor,chargedUnitPriceMinor:item.chargedUnitPriceMinor,grossMinor:item.grossMinor,lineDiscountMinor:item.lineDiscountMinor,gstMinor:item.gstMinor,lineTotalMinor:item.lineTotalMinor,cogsMinor,allocations:allocation.map(a=>({batchId:a.batch.id,quantity:a.quantity})),warnings:itemWarnings}); }
    if(warnings.length&&sale.enforceWarningAcknowledgement&&!sale.warningAcknowledged)throw new Error('Acknowledge all medicine and expiry warnings before posting the sale');
    if(warnings.length&&sale.warningAcknowledged){if(!sale.createdBy)throw new Error('Acknowledging user is required');this.db.prepare(`INSERT INTO SaleWarningAcknowledgements(sale_id,warnings_json,doctor_name,prescription_reference,acknowledged_by,acknowledged_at) VALUES (?,?,?,?,?,?)`).run(saleId,JSON.stringify(warnings),sale.doctorName||null,sale.prescriptionReference||null,sale.createdBy,now);}
    this.db.prepare("UPDATE Sales SET cogs_minor=? WHERE id=?").run(totalCogs,saleId);
    if(amountPaidMinor>0) this.db.prepare(`INSERT INTO MoneyMovements(direction,method,amount_minor,reference_type,reference_id,occurred_at,user_id,note) VALUES ('in',? ,?,'sale',?,?,?,'Sale collection')`).run(collectionMethod,amountPaidMinor,String(saleId),soldAt,sale.createdBy||null);
    if(balanceDueMinor>0) this.db.prepare(`INSERT INTO Receivables(customer_id,source_type,source_id,original_minor,balance_minor,due_date,status,created_at,updated_at) VALUES (?,'sale',?,?,?,?,?,?,?)`).run(sale.customerId,String(saleId),balanceDueMinor,balanceDueMinor,sale.dueDate,amountPaidMinor>0?"partial":"unpaid",now,now);
    this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,new_json,device_id) VALUES (?,?,?,'sale.post','sale',?,?,?)`).run(now,sale.createdBy||null,sale.roleCode||null,String(saleId),JSON.stringify({invoiceNumber:sale.invoiceNumber,finalTotalMinor,amountPaidMinor,balanceDueMinor,totalCogs,invoiceDiscountType:sale.invoiceDiscountType||null,invoiceDiscountValue:sale.invoiceDiscountValue||0,invoiceDiscountMinor,pricing:items.map(item=>({lineNumber:item.lineNumber,productId:item.product.id,originalUnitPriceMinor:item.originalUnitPriceMinor,chargedUnitPriceMinor:item.chargedUnitPriceMinor,lineDiscountType:item.lineDiscountType||null,lineDiscountValue:item.lineDiscountValue||0,lineDiscountMinor:item.lineDiscountMinor})),batchOverrides:items.filter(item=>item.overrideBatchId).map(item=>({lineNumber:item.lineNumber,productId:item.product.id,suggestedBatchId:item.suggestedBatchId,selectedBatchId:item.overrideBatchId,reason:item.overrideReason,allocations:postedItems.find(posted=>posted.lineNumber===item.lineNumber)?.allocations||[]})),warningAcknowledgement:warnings.length?{warnings,acknowledged:Boolean(sale.warningAcknowledged),acknowledgedBy:sale.warningAcknowledged?sale.createdBy:null,acknowledgedAt:sale.warningAcknowledged?now:null,doctorName:sale.doctorName||null,prescriptionReference:sale.prescriptionReference||null}:null}),sale.deviceId||null);
    return {saleId,invoiceNumber:sale.invoiceNumber,grossMinor,lineDiscountMinor,invoiceDiscountMinor,taxableMinor,gstMinor,exactTotalMinor,roundingMinor:finalTotalMinor-exactTotalMinor,finalTotalMinor,amountPaidMinor,balanceDueMinor,cogsMinor:totalCogs,items:postedItems,warnings};
  }
  normalizeItem(item,lineNumber,roleCode){ const product=this.db.prepare("SELECT * FROM Products WHERE id=? AND active=1").get(item.productId); if(!product) throw new Error("Active product was not found");
    const unit=this.db.prepare("SELECT * FROM ProductUnits WHERE product_id=? AND unit_name=? COLLATE NOCASE").get(product.id,item.saleUnit); if(!unit) throw new Error("Sale unit is not configured");
    const enteredQuantity=Number(item.quantity); if(!Number.isFinite(enteredQuantity)||enteredQuantity<=0) throw new Error("Quantity must be greater than zero"); if(!unit.allows_fractional_quantity&&!Number.isInteger(enteredQuantity)) throw new Error("Fractional quantity is not allowed");
    const originalUnitPriceMinor=unit.selling_price_minor??product.default_sale_price_minor; const chargedUnitPriceMinor=item.unitPriceMinor??originalUnitPriceMinor;
    if(!Number.isInteger(chargedUnitPriceMinor)||chargedUnitPriceMinor<0) throw new Error("Unit price must be non-negative integer minor units");
    const grossMinor=Math.round(enteredQuantity*chargedUnitPriceMinor); const lineDiscountMinor=this.discountAmount(grossMinor,item.discountType,item.discountValue||0); if(lineDiscountMinor>grossMinor) throw new Error("Line discount cannot exceed line amount");
    const overrideBatchId=item.overrideBatchId==null?null:Number(item.overrideBatchId),overrideReason=String(item.overrideReason||'').trim();if(overrideBatchId!=null&&(!['pharmacist','manager','admin'].includes(roleCode)||!Number.isSafeInteger(overrideBatchId)||overrideBatchId<1||!overrideReason))throw new Error("Authorized batch override and reason are required");if(overrideReason.length>500)throw new Error("Batch override reason must be 500 characters or fewer");
    return {product,lineNumber,saleUnit:item.saleUnit,enteredQuantity,baseQuantity:enteredQuantity*Number(unit.base_quantity),originalUnitPriceMinor,chargedUnitPriceMinor,grossMinor,lineDiscountType:item.discountType,lineDiscountValue:item.discountValue||0,lineDiscountMinor,afterLineMinor:grossMinor-lineDiscountMinor,overrideBatchId,overrideReason}; }
  discountAmount(base,type,value){ const amount=Number(value||0); if(!Number.isFinite(amount)||amount<0) throw new Error("Discount cannot be negative"); if(!type||amount===0)return 0; if(type==="fixed")return Math.round(amount); if(type==="percentage"){if(amount>100)throw new Error("Percentage discount cannot exceed 100"); return Math.round(base*amount/100);} throw new Error("Unsupported discount type"); }
  suggestedFefoBatchId(productId,saleDate){return this.db.prepare(`SELECT id FROM ProductBatches WHERE product_id=? AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>?) ORDER BY expiry_date IS NULL,expiry_date,received_at,id LIMIT 1`).get(productId,saleDate)?.id||null;}
  allocateFefo(productId,required,saleDate,preferredBatchId=null){ let batches=this.db.prepare(`SELECT * FROM ProductBatches WHERE product_id=? AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>?) ORDER BY expiry_date IS NULL,expiry_date,received_at,id`).all(productId,saleDate);if(preferredBatchId!=null){const index=batches.findIndex(batch=>Number(batch.id)===Number(preferredBatchId));if(index<0)throw new Error("Selected batch is unavailable, expired, empty or belongs to another product");batches=[batches[index],...batches.filter((_,i)=>i!==index)];}
    let remaining=required; const allocations=[]; for(const batch of batches){if(remaining<=0)break; const take=Math.min(remaining,Number(batch.quantity_on_hand)); allocations.push({batch,quantity:take,cogsMinor:Math.round(take*Number(batch.unit_cost_minor))}); remaining-=take;} if(remaining>1e-9)throw new Error("Insufficient valid sellable stock"); return allocations; }
  daysUntil(from,to){return Math.ceil((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);}
}
module.exports={SalesPostingService};
