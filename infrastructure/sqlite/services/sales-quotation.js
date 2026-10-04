const { roundPayableToRupee } = require('../../domain/utils');

const METHODS = new Set(['cash','card','digital','bank_transfer','mobile_wallet','other','credit']);

class SalesQuotationService {
  constructor(db){this.db=db;}

  quote(sale){
    const plan=this.plan(sale);
    return {
      invoiceNumber:sale.invoiceNumber,
      grossMinor:plan.grossMinor,lineDiscountMinor:plan.lineDiscountMinor,invoiceDiscountMinor:plan.invoiceDiscountMinor,
      taxableMinor:plan.taxableMinor,gstMinor:plan.gstMinor,exactTotalMinor:plan.exactTotalMinor,roundingMinor:plan.roundingMinor,
      finalTotalMinor:plan.finalTotalMinor,amountPaidMinor:plan.amountPaidMinor,balanceDueMinor:plan.balanceDueMinor,
      cashTenderedMinor:plan.cashTenderedMinor,cashChangeMinor:plan.cashChangeMinor,cogsMinor:plan.cogsMinor,warnings:plan.warnings,
      items:plan.items.map(item=>({lineNumber:item.lineNumber,productId:item.product.id,baseQuantity:item.baseQuantity,
        originalUnitPriceMinor:item.originalUnitPriceMinor,chargedUnitPriceMinor:item.chargedUnitPriceMinor,grossMinor:item.grossMinor,
        lineDiscountMinor:item.lineDiscountMinor,gstMinor:item.gstMinor,lineTotalMinor:item.lineTotalMinor,cogsMinor:item.cogsMinor,
        allocations:item.allocations.map(allocation=>({batchId:allocation.batch.id,quantity:allocation.quantity})),warnings:item.warnings})),
    };
  }

  plan(sale){
    if(!sale?.invoiceNumber?.trim())throw new Error('Invoice number is required');
    if(!sale.idempotencyKey?.trim())throw new Error('Idempotency key is required');
    if(!Array.isArray(sale.items)||sale.items.length===0)throw new Error('At least one sale item is required');
    const soldAt=sale.soldAt||new Date().toISOString(),saleDate=soldAt.slice(0,10);
    const method=sale.paymentMethod||'cash';if(!METHODS.has(method))throw new Error('Unsupported payment method');
    const warningSetting=this.db.prepare("SELECT value_json FROM Settings WHERE key='nearExpiryWarningDays'").get();
    let warningDays=90;
    if(warningSetting){try{const value=JSON.parse(warningSetting.value_json);if(Number.isSafeInteger(value)&&value>=0&&value<=365)warningDays=value}catch{}}
    const items=sale.items.map((item,index)=>this.normalizeItem(item,index+1,sale.roleCode));
    const grossMinor=items.reduce((sum,item)=>sum+item.grossMinor,0);
    const lineDiscountMinor=items.reduce((sum,item)=>sum+item.lineDiscountMinor,0);
    const afterLine=grossMinor-lineDiscountMinor;
    const invoiceDiscountMinor=this.discountAmount(afterLine,sale.invoiceDiscountType,sale.invoiceDiscountValue||0);
    if(invoiceDiscountMinor>afterLine)throw new Error('Invoice discount cannot exceed invoice amount');
    let allocatedDiscount=0;
    items.forEach((item,index)=>{
      item.invoiceDiscountMinor=index===items.length-1?invoiceDiscountMinor-allocatedDiscount:Math.round(invoiceDiscountMinor*(item.afterLineMinor/afterLine||0));
      allocatedDiscount+=item.invoiceDiscountMinor;
      item.taxableMinor=item.product.tax_status==='taxable'?item.afterLineMinor-item.invoiceDiscountMinor:0;
      item.gstMinor=Math.round(item.taxableMinor*item.product.gst_rate_basis_points/10000);
      item.lineTotalMinor=item.afterLineMinor-item.invoiceDiscountMinor+item.gstMinor;
      item.suggestedBatchId=this.suggestedFefoBatchId(item.product.id,saleDate);
      item.allocations=this.allocateFefo(item.product.id,item.baseQuantity,saleDate,item.overrideBatchId);
      item.cogsMinor=item.allocations.reduce((sum,allocation)=>sum+allocation.cogsMinor,0);
      item.warnings=[];
      if(item.product.prescription_required)item.warnings.push({type:'prescription'});
      if(item.product.controlled_medicine)item.warnings.push({type:'controlled'});
      for(const allocation of item.allocations){
        if(allocation.batch.expiry_date&&this.daysUntil(saleDate,allocation.batch.expiry_date)<=warningDays)item.warnings.push({type:'near_expiry',batchId:allocation.batch.id,expiryDate:allocation.batch.expiry_date});
      }
    });
    const taxableMinor=items.reduce((sum,item)=>sum+item.taxableMinor,0),gstMinor=items.reduce((sum,item)=>sum+item.gstMinor,0);
    const exactTotalMinor=items.reduce((sum,item)=>sum+item.lineTotalMinor,0),finalTotalMinor=roundPayableToRupee(exactTotalMinor);
    const cashTenderedMinor=sale.cashTenderedMinor==null?null:Number(sale.cashTenderedMinor);
    if(cashTenderedMinor!=null&&(!Number.isInteger(cashTenderedMinor)||cashTenderedMinor<0||(sale.enforceCashTender&&cashTenderedMinor<finalTotalMinor)))throw new Error('Cash tendered must be at least the final total');
    if(method!=='cash'&&cashTenderedMinor!=null)throw new Error('Cash tender is only valid for cash payment');
    if(sale.enforceCashTender&&method==='cash'&&cashTenderedMinor==null)throw new Error('Enter cash tendered before posting the sale');
    const cashChangeMinor=cashTenderedMinor==null||cashTenderedMinor<finalTotalMinor?null:cashTenderedMinor-finalTotalMinor;
    const amountPaidMinor=sale.amountPaidMinor==null?(method==='credit'?0:finalTotalMinor):Number(sale.amountPaidMinor);
    if(Number.isInteger(amountPaidMinor)&&amountPaidMinor>finalTotalMinor)throw new Error('Received amount cannot exceed the sale total');
    if(!Number.isInteger(amountPaidMinor)||amountPaidMinor<0)throw new Error('Amount paid must be between zero and final total');
    const balanceDueMinor=finalTotalMinor-amountPaidMinor;
    const collectionMethod=method==='credit'?(sale.collectionMethod||null):method;
    if(amountPaidMinor>0&&(!collectionMethod||collectionMethod==='credit'||!METHODS.has(collectionMethod)))throw new Error('Actual collection method is required for a partial credit payment');
    if(balanceDueMinor>0){if(!sale.customerId)throw new Error('Customer selection is required; select or add a customer for partial or credit sale');if(!sale.dueDate)throw new Error('Due date is required when balance remains');if(!/^\d{4}-\d{2}-\d{2}$/.test(sale.dueDate)||Number.isNaN(Date.parse(sale.dueDate))||new Date(sale.dueDate+'T00:00:00Z').toISOString().slice(0,10)!==sale.dueDate)throw new Error('Choose a valid due date');if(sale.dueDate<saleDate)throw new Error('Due date cannot be earlier than sale date');}
    const customer=sale.customerId?this.db.prepare('SELECT * FROM Customers WHERE id=? AND active=1').get(sale.customerId):null;
    if(sale.customerId&&!customer)throw new Error('Active customer was not found');
    if(balanceDueMinor>0&&(!customer.name?.trim()||!customer.phone?.trim()))throw new Error('Customer name and phone are required for credit sale');
    const warnings=items.flatMap(item=>item.warnings.map(warning=>({lineNumber:item.lineNumber,productId:item.product.id,...warning})));
    if(warnings.length&&sale.enforceWarningAcknowledgement&&!sale.warningAcknowledged)throw new Error('Acknowledge all medicine and expiry warnings before posting the sale');
    return {
      soldAt,saleDate,method,customer,collectionMethod,
      paymentStatus:balanceDueMinor===0?'paid':amountPaidMinor>0?'partial':'credit',
      grossMinor,lineDiscountMinor,invoiceDiscountMinor,taxableMinor,gstMinor,exactTotalMinor,
      roundingMinor:finalTotalMinor-exactTotalMinor,finalTotalMinor,amountPaidMinor,balanceDueMinor,
      cashTenderedMinor,cashChangeMinor,cogsMinor:items.reduce((sum,item)=>sum+item.cogsMinor,0),warnings,items,
    };
  }

  normalizeItem(item,lineNumber,roleCode){
    const product=this.db.prepare('SELECT * FROM Products WHERE id=? AND active=1').get(item.productId);if(!product)throw new Error('Active product was not found');
    const unit=this.db.prepare('SELECT * FROM ProductUnits WHERE product_id=? AND unit_name=? COLLATE NOCASE').get(product.id,item.saleUnit);if(!unit)throw new Error('Sale unit is not configured');
    const enteredQuantity=Number(item.quantity);if(!Number.isFinite(enteredQuantity)||enteredQuantity<=0)throw new Error('Quantity must be greater than zero');if(!unit.allows_fractional_quantity&&!Number.isInteger(enteredQuantity))throw new Error('Fractional quantity is not allowed');
    const originalUnitPriceMinor=unit.selling_price_minor??product.default_sale_price_minor,chargedUnitPriceMinor=item.unitPriceMinor??originalUnitPriceMinor;
    if(!Number.isInteger(chargedUnitPriceMinor)||chargedUnitPriceMinor<0)throw new Error('Unit price must be non-negative integer minor units');
    const grossMinor=Math.round(enteredQuantity*chargedUnitPriceMinor),lineDiscountMinor=this.discountAmount(grossMinor,item.discountType,item.discountValue||0);if(lineDiscountMinor>grossMinor)throw new Error('Line discount cannot exceed line amount');
    const overrideBatchId=item.overrideBatchId==null?null:Number(item.overrideBatchId),overrideReason=String(item.overrideReason||'').trim();
    if(overrideBatchId!=null&&(!['pharmacist','manager','admin'].includes(roleCode)||!Number.isSafeInteger(overrideBatchId)||overrideBatchId<1||!overrideReason))throw new Error('Authorized batch override and reason are required');
    if(overrideReason.length>500)throw new Error('Batch override reason must be 500 characters or fewer');
    return {product,lineNumber,saleUnit:item.saleUnit,enteredQuantity,baseQuantity:enteredQuantity*Number(unit.base_quantity),originalUnitPriceMinor,chargedUnitPriceMinor,grossMinor,lineDiscountType:item.discountType,lineDiscountValue:item.discountValue||0,lineDiscountMinor,afterLineMinor:grossMinor-lineDiscountMinor,overrideBatchId,overrideReason};
  }
  discountAmount(base,type,value){const amount=Number(value||0);if(!Number.isFinite(amount)||amount<0)throw new Error('Discount cannot be negative');if(!type||amount===0)return 0;if(type==='fixed')return Math.round(amount);if(type==='percentage'){if(amount>100)throw new Error('Percentage discount cannot exceed 100');return Math.round(base*amount/100);}throw new Error('Unsupported discount type');}
  suggestedFefoBatchId(productId,saleDate){return this.db.prepare(`SELECT id FROM ProductBatches WHERE product_id=? AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>?) ORDER BY expiry_date IS NULL,expiry_date,received_at,id LIMIT 1`).get(productId,saleDate)?.id||null;}
  allocateFefo(productId,required,saleDate,preferredBatchId=null){let batches=this.db.prepare(`SELECT * FROM ProductBatches WHERE product_id=? AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>?) ORDER BY expiry_date IS NULL,expiry_date,received_at,id`).all(productId,saleDate);if(preferredBatchId!=null){const index=batches.findIndex(batch=>Number(batch.id)===Number(preferredBatchId));if(index<0)throw new Error('Selected batch is unavailable, expired, empty or belongs to another product');batches=[batches[index],...batches.filter((_,i)=>i!==index)];}let remaining=required;const allocations=[];for(const batch of batches){if(remaining<=0)break;const take=Math.min(remaining,Number(batch.quantity_on_hand));allocations.push({batch,quantity:take,cogsMinor:Math.round(take*Number(batch.unit_cost_minor))});remaining-=take;}if(remaining>1e-9)throw new Error('Insufficient valid sellable stock');return allocations;}
  daysUntil(from,to){return Math.ceil((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);}
}

module.exports={SalesQuotationService};
