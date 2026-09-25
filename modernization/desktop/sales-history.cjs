const {SalesQueryService}=require('../../infrastructure/sqlite/services/sales-query');
const text=(value,max=100)=>String(value??'').trim().slice(0,max);
class SalesHistoryDesktop{
 constructor(db){this.db=db;this.query=new SalesQueryService(db);}
 search(input={}){return this.query.searchPaged({invoiceNumber:text(input.invoiceNumber),product:text(input.product),phone:text(input.phone,30),paymentStatus:text(input.paymentStatus,20),dateFrom:text(input.dateFrom,10),dateTo:text(input.dateTo,10),page:Number(input.page||1),pageSize:25});}
 detail(input,options={}){
  const id=Number(input.id);if(!Number.isSafeInteger(id)||id<1)throw Error('Choose a valid invoice');
  const sale=this.query.getById(id);if(!sale)throw Error('Invoice was not found');
  const receipt=this.query.receipt(id);
  const returned=this.db.prepare(`SELECT sri.sale_item_id,COALESCE(SUM(sri.base_quantity),0) returned_quantity,COALESCE(SUM(sri.refund_minor),0) refund_minor FROM SaleReturnItems sri JOIN SaleReturns sr ON sr.id=sri.sale_return_id WHERE sr.sale_id=? GROUP BY sri.sale_item_id`).all(id);
  const returnedByItem=new Map(returned.map(row=>[row.sale_item_id,row]));
  const receivable=this.db.prepare("SELECT id,balance_minor,due_date,status FROM Receivables WHERE source_type='sale' AND source_id=?").get(String(id))||null;
  const payments=receivable?this.db.prepare('SELECT id,amount_minor,method,collected_at FROM ReceivablePayments WHERE receivable_id=? ORDER BY collected_at,id').all(receivable.id):[];
  const returns=this.db.prepare('SELECT id,returned_at,total_minor,receivable_credit_minor,refund_minor,reason FROM SaleReturns WHERE sale_id=? ORDER BY returned_at,id').all(id);
  const audit=options.canViewAudit?this.db.prepare(`SELECT id,occurred_at,action,role_code,reason,new_json FROM AuditLog WHERE (entity_type='sale' AND entity_id=?) OR (entity_type='sale_return' AND json_extract(new_json,'$.saleId')=?) ORDER BY occurred_at,id`).all(String(id),id).map(row=>({...row,new_json:row.new_json?JSON.parse(row.new_json):null})):[];
  return{saleId:id,invoiceNumber:sale.invoice_number,soldAt:sale.sold_at,status:sale.status,customer:{id:sale.customer_id,name:sale.customer_name_snapshot,phone:sale.customer_phone_snapshot},payment:receipt.payment,totals:receipt.totals,warningAcknowledgement:receipt.warningAcknowledgement,receipt,items:sale.items.map(item=>{const prior=returnedByItem.get(item.id);return{id:item.id,lineNumber:item.line_number,productName:item.product_name_snapshot,genericName:item.generic_name_snapshot,saleUnit:item.sale_unit,quantity:Number(item.entered_quantity),baseQuantity:Number(item.base_quantity),unitPriceMinor:item.charged_unit_price_minor,lineDiscountMinor:item.line_discount_minor,gstMinor:item.gst_minor,lineTotalMinor:item.line_total_minor,returnedBaseQuantity:Number(prior?.returned_quantity||0),returnedMinor:Number(prior?.refund_minor||0),returnableBaseQuantity:Number(item.base_quantity)-Number(prior?.returned_quantity||0)};}),receivable,payments,returns,audit,actions:{canPrint:Boolean(options.canPrint),canViewCustomerHistory:Boolean(options.canViewCustomerHistory&&sale.customer_phone_snapshot),canStartReturn:Boolean(options.canStartReturn&&sale.status==='posted'),canViewAudit:Boolean(options.canViewAudit)}};
 }
 customerHistory(input={}){const phone=text(input.phone,30);if(!phone)throw Error('Enter a customer phone number');return this.query.searchPaged({phone,page:Number(input.page||1),pageSize:25});}
}
module.exports={SalesHistoryDesktop};
