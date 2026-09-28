const {reportRange}=require('./reports.cjs');
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';

function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid purchase report filters');
 for(const key of ['supplier','product','generic','category','brand']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid purchase report filters');
  if(String(input[key]||'').length>100)throw Error('Purchase report filter is too long');
 }
 const range=reportRange(input,options.now),dayMode=input.dayMode||'official';
 if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
 const day=dayMode==='official'?`COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
  WHERE julianday(p.purchased_at)>=julianday(bd.opened_at) AND (bd.closed_at IS NULL OR julianday(p.purchased_at)<julianday(bd.closed_at))
  ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',p.purchased_at,'+5 hours'))`:
  `strftime('%Y-%m-%d',p.purchased_at,'+5 hours')`;
 const clauses=['day>=?','day<=?'],args=[range.from,range.to];
 if(input.supplier?.trim()){clauses.push("supplier LIKE ? ESCAPE '\\'");args.push(like(input.supplier.trim()))}
 const lineFilters=[],lineArgs=[];
 if(input.product?.trim()){lineFilters.push("(pr.name LIKE ? ESCAPE '\\' OR pr.sku LIKE ? ESCAPE '\\')");lineArgs.push(like(input.product.trim()),like(input.product.trim()))}
 if(input.generic?.trim()){lineFilters.push("pr.generic_name LIKE ? ESCAPE '\\'");lineArgs.push(like(input.generic.trim()))}
 if(input.category?.trim()){lineFilters.push("pr.category LIKE ? ESCAPE '\\'");lineArgs.push(like(input.category.trim()))}
 if(input.brand?.trim()){lineFilters.push("pr.manufacturer LIKE ? ESCAPE '\\'");lineArgs.push(like(input.brand.trim()))}
 if(lineFilters.length){clauses.push(`EXISTS (SELECT 1 FROM PurchaseItems pi JOIN Products pr ON pr.id=pi.product_id WHERE pi.purchase_id=selected_purchases.id AND ${lineFilters.join(' AND ')})`);args.push(...lineArgs)}
 const rows=db.prepare(`WITH selected_purchases AS (SELECT p.id,p.invoice_number,p.purchased_at,p.total_minor,p.amount_paid_minor,p.balance_due_minor,
  p.payment_method,p.due_date,s.name supplier,${day} day,
  (SELECT COALESCE(SUM(pp.amount_minor),0) FROM PurchasePayments pp WHERE pp.purchase_id=p.id) later_payments_minor,
  (SELECT COALESCE(SUM(r.total_minor),0) FROM PurchaseReturns r WHERE r.purchase_id=p.id) supplier_returns_minor,
  (SELECT COALESCE(SUM(r.payable_credit_minor),0) FROM PurchaseReturns r WHERE r.purchase_id=p.id) return_credit_minor,
  (SELECT COALESCE(SUM(r.refund_minor),0) FROM PurchaseReturns r WHERE r.purchase_id=p.id) return_refund_minor,
  (SELECT COALESCE(SUM(pi.line_total_minor),0) FROM PurchaseItems pi WHERE pi.purchase_id=p.id) line_total_minor,
  (SELECT COALESCE(SUM(pi.purchased_quantity*pi.units_per_purchase_unit),0) FROM PurchaseItems pi WHERE pi.purchase_id=p.id) purchased_base_quantity,
  (SELECT COALESCE(SUM(pi.bonus_quantity*pi.units_per_purchase_unit),0) FROM PurchaseItems pi WHERE pi.purchase_id=p.id) bonus_base_quantity,
  (SELECT COALESCE(SUM(pi.base_quantity_received),0) FROM PurchaseItems pi WHERE pi.purchase_id=p.id) received_base_quantity,
  (SELECT COUNT(*) FROM PurchaseItems pi WHERE pi.purchase_id=p.id) line_count
  FROM Purchases p JOIN Suppliers s ON s.id=p.supplier_id WHERE p.status='posted')
  SELECT * FROM selected_purchases WHERE ${clauses.join(' AND ')} ORDER BY julianday(purchased_at) DESC,id DESC`).all(...args);
 if(rows.length>10000)throw Error('Purchase report exceeds 10,000 purchases; narrow the dates or filters');
 const items=rows.map(row=>{
  if(!row.line_count||row.line_total_minor!==row.total_minor)throw Error('Saved purchase lines do not reconcile to the purchase total');
  const paidAtReceivingMinor=row.amount_paid_minor-row.later_payments_minor;
  if(paidAtReceivingMinor<0||row.total_minor-paidAtReceivingMinor-row.later_payments_minor-row.return_credit_minor!==row.balance_due_minor)
   throw Error('Saved purchase payments and credits do not reconcile to the balance');
  return {id:row.id,day:row.day,purchasedAt:row.purchased_at,invoice:row.invoice_number||'',supplier:row.supplier,
   method:row.payment_method,dueDate:row.due_date||'',lineCount:row.line_count,totalMinor:row.total_minor,
   paidAtReceivingMinor,laterPaymentsMinor:row.later_payments_minor,balanceDueMinor:row.balance_due_minor,
   supplierReturnsMinor:row.supplier_returns_minor,returnCreditMinor:row.return_credit_minor,returnRefundMinor:row.return_refund_minor,
   netPurchaseMinor:row.total_minor-row.supplier_returns_minor,purchasedBaseQuantity:row.purchased_base_quantity,
   bonusBaseQuantity:row.bonus_base_quantity,receivedBaseQuantity:row.received_base_quantity};
 });
 return {range:{from:range.from,to:range.to},dayMode,items};
}

function purchaseSummary(db,input,options={}){
 const {range,dayMode,items}=data(db,input,options);
 const fields=['totalMinor','paidAtReceivingMinor','laterPaymentsMinor','balanceDueMinor','supplierReturnsMinor','returnCreditMinor','returnRefundMinor','netPurchaseMinor','purchasedBaseQuantity','bonusBaseQuantity','receivedBaseQuantity'];
 const totals=Object.fromEntries(fields.map(field=>[field,items.reduce((sum,row)=>sum+row[field],0)]));totals.purchaseCount=items.length;
 return {range,dayMode,items,totals,
  scope:'Date and supplier select posted purchases. Product/generic/current category/brand filters select whole purchases containing a matching line. Paid at receiving excludes later supplier payments; linked supplier returns and current balance include later activity regardless of purchase-date filter. Purchases are stock acquisition, not P&L expense.'};
}
function purchaseEntries(db,input,options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function purchaseCsv(db,input,options={}){
 const report=purchaseSummary(db,input,options),out=[['Purchase Report'],['Range',report.range.from,report.range.to],['Day grouping',report.dayMode],['Scope',report.scope],[],
  ['Day','Purchase invoice','Supplier','Payment method','Total minor','Paid at receiving minor','Later payments minor','Current balance minor','Linked supplier returns minor','Return payable credit minor','Return refund minor','Net purchase minor','Purchased base quantity','Bonus base quantity','Received base quantity'],
  ...report.items.map(r=>[r.day,r.invoice,r.supplier,r.method,r.totalMinor,r.paidAtReceivingMinor,r.laterPaymentsMinor,r.balanceDueMinor,r.supplierReturnsMinor,r.returnCreditMinor,r.returnRefundMinor,r.netPurchaseMinor,r.purchasedBaseQuantity,r.bonusBaseQuantity,r.receivedBaseQuantity]),[],
  ...[['Total purchases minor','totalMinor'],['Total paid at receiving minor','paidAtReceivingMinor'],['Total later payments minor','laterPaymentsMinor'],['Total current balance minor','balanceDueMinor'],['Total supplier returns minor','supplierReturnsMinor'],['Total net purchases minor','netPurchaseMinor']].map(([label,field])=>[label,report.totals[field]])];
 return {filename:'TechOrbit_Purchase_Report.csv',csv:'\uFEFF'+out.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function purchaseXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),report=purchaseSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Purchase Report');
 sheet.addRow(['TechOrbit Pharmacy POS - Purchase Report']);sheet.addRow(['From',report.range.from,'To',report.range.to]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Purchase invoice','Supplier','Method','Total PKR','Paid at receiving PKR','Later payments PKR','Current balance PKR','Supplier returns PKR','Net purchase PKR','Purchased base units','Bonus base units','Received base units']);
 for(const r of report.items)sheet.addRow([r.day,r.invoice,r.supplier,r.method,r.totalMinor/100,r.paidAtReceivingMinor/100,r.laterPaymentsMinor/100,r.balanceDueMinor/100,r.supplierReturnsMinor/100,r.netPurchaseMinor/100,r.purchasedBaseQuantity,r.bonusBaseQuantity,r.receivedBaseQuantity]);
 sheet.addRow([]);sheet.addRow(['Total purchases PKR',report.totals.totalMinor/100]);sheet.addRow(['Net purchases PKR',report.totals.netPurchaseMinor/100]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:13},(_,i)=>({width:i<4?23:20}));
 return {filename:'TechOrbit_Purchase_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function purchasePdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),report=purchaseSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Purchase Report');line(`${report.range.from} to ${report.range.to}`);
 for(const [label,value] of [['Posted purchases',report.totals.totalMinor],['Linked supplier returns',report.totals.supplierReturnsMinor],['Net purchases',report.totals.netPurchaseMinor],['Current payable balance',report.totals.balanceDueMinor]])line(label,`PKR ${(value/100).toFixed(2)}`);
 line('Purchase invoice / supplier','Total PKR');for(const row of report.items)line(`${row.invoice} / ${row.supplier}`,(row.totalMinor/100).toFixed(2));
 return {filename:'TechOrbit_Purchase_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={purchaseSummary,purchaseEntries,purchaseCsv,purchaseXlsx,purchasePdf};
