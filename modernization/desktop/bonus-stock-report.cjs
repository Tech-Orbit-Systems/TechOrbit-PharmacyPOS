const {reportRange}=require('./reports.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const fields=['purchasedBaseQuantity','bonusBaseQuantity','receivedBaseQuantity','paidCostMinor'];
function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid bonus report filters');
 for(const key of ['supplier','product','generic','category','brand']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid bonus report filters');
  if(String(input[key]||'').length>100)throw Error('Bonus report filter is too long');
 }
 const range=reportRange(input,options.now),dayMode=input.dayMode||'official';
 if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
 const day=dayMode==='official'?`COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
  WHERE julianday(p.purchased_at)>=julianday(bd.opened_at) AND (bd.closed_at IS NULL OR julianday(p.purchased_at)<julianday(bd.closed_at))
  ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',p.purchased_at,'+5 hours'))`:
  `strftime('%Y-%m-%d',p.purchased_at,'+5 hours')`;
 const clauses=['day>=?','day<=?'],args=[range.from,range.to];
 for(const [key,column] of [['supplier','supplier'],['product','medicine'],['generic','generic'],['category','category'],['brand','brand']]){
  if(input[key]?.trim()){clauses.push(`${column} LIKE ? ESCAPE '\\'`);args.push(like(input[key].trim()))}
 }
 const rows=db.prepare(`WITH source AS (SELECT pi.id,p.id purchase_id,p.invoice_number invoice,p.purchased_at,${day} day,
  s.id supplier_id,s.name supplier,pr.id product_id,pr.name medicine,pr.sku,pr.generic_name generic,
  pr.category,pr.manufacturer brand,b.batch_number batch,b.expiry_date expiry_date,
  pi.purchase_unit,pi.units_per_purchase_unit,pi.purchased_quantity,pi.bonus_quantity,
  pi.line_total_minor paid_cost_minor,pi.effective_unit_cost_minor,
  pi.purchased_quantity*pi.units_per_purchase_unit purchased_base_quantity,
  pi.bonus_quantity*pi.units_per_purchase_unit bonus_base_quantity,pi.base_quantity_received received_base_quantity,
  br.purchased_base_quantity receipt_purchased,br.bonus_base_quantity receipt_bonus,
  br.total_cost_minor receipt_cost,br.effective_unit_cost_minor receipt_effective
  FROM PurchaseItems pi JOIN Purchases p ON p.id=pi.purchase_id AND p.status='posted'
  JOIN Suppliers s ON s.id=p.supplier_id JOIN Products pr ON pr.id=pi.product_id
  JOIN ProductBatches b ON b.id=pi.batch_id LEFT JOIN BatchReceipts br ON br.id=pi.receipt_id
  WHERE pi.bonus_quantity>0)
  SELECT * FROM source WHERE ${clauses.join(' AND ')} ORDER BY julianday(purchased_at) DESC,id DESC`).all(...args);
 if(rows.length>10000)throw Error('Bonus report exceeds 10,000 lines; narrow the dates or filters');
 const items=rows.map(row=>{
  if(row.receipt_purchased!==row.purchased_base_quantity||row.receipt_bonus!==row.bonus_base_quantity||
   row.receipt_cost!==row.paid_cost_minor||row.receipt_effective!==row.effective_unit_cost_minor||
   row.received_base_quantity!==row.purchased_base_quantity+row.bonus_base_quantity)
   throw Error('Bonus purchase line does not reconcile to the batch receipt');
  return {id:row.id,purchaseId:row.purchase_id,day:row.day,invoice:row.invoice||'',supplierId:row.supplier_id,supplier:row.supplier,
   productId:row.product_id,medicine:row.medicine,sku:row.sku||'',generic:row.generic||'',category:row.category||'',brand:row.brand||'',
   batch:row.batch||'',expiryDate:row.expiry_date||'',purchaseUnit:row.purchase_unit,unitsPerPurchaseUnit:row.units_per_purchase_unit,
   purchasedQuantity:row.purchased_quantity,bonusQuantity:row.bonus_quantity,purchasedBaseQuantity:row.purchased_base_quantity,
   bonusBaseQuantity:row.bonus_base_quantity,receivedBaseQuantity:row.received_base_quantity,
   paidCostMinor:row.paid_cost_minor,effectiveUnitCostMinor:row.effective_unit_cost_minor};
 });
 return {range:{from:range.from,to:range.to},dayMode,items};
}
function bonusStockSummary(db,input,options={}){
 const {range,dayMode,items}=data(db,input,options),groups=new Map(),totals={lineCount:items.length};
 for(const field of fields)totals[field]=0;
 for(const row of items){
  let group=groups.get(row.productId);
  if(!group){group={productId:row.productId,medicine:row.medicine,sku:row.sku,generic:row.generic,category:row.category,brand:row.brand,lineCount:0};for(const field of fields)group[field]=0;groups.set(row.productId,group)}
  group.lineCount++;
  for(const field of fields){group[field]+=row[field];totals[field]+=row[field]}
 }
 const products=[...groups.values()].sort((a,b)=>a.medicine.localeCompare(b.medicine)||a.productId-b.productId);
 for(const field of fields)if(products.reduce((sum,row)=>sum+row[field],0)!==totals[field])throw Error('Bonus product groups do not reconcile');
 return {range,dayMode,items,products,totals,scope:'Only posted purchase lines with recorded bonus units are included. Paid cost is the complete line cost spread over paid plus free units; bonus quantity is not a separate purchase expense or realized saving. Physical stock after subsequent movements belongs in the live stock report.'};
}
function bonusStockEntries(db,input,options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function bonusStockCsv(db,input,options={}){
 const report=bonusStockSummary(db,input,options),rows=[['Bonus Stock/Scheme Report'],['Range',report.range.from,report.range.to],['Scope',report.scope],[],
  ['Day','Supplier','Invoice','Medicine','SKU','Batch','Expiry','Purchase unit','Paid units','Bonus units','Units per purchase unit','Purchased base units','Bonus base units','Received base units','Paid cost minor','Effective unit cost minor'],
  ...report.items.map(r=>[r.day,r.supplier,r.invoice,r.medicine,r.sku,r.batch,r.expiryDate,r.purchaseUnit,r.purchasedQuantity,r.bonusQuantity,r.unitsPerPurchaseUnit,r.purchasedBaseQuantity,r.bonusBaseQuantity,r.receivedBaseQuantity,r.paidCostMinor,r.effectiveUnitCostMinor]),[],
  ['Total purchased base units',report.totals.purchasedBaseQuantity],['Total bonus base units',report.totals.bonusBaseQuantity],['Total received base units',report.totals.receivedBaseQuantity],['Total paid cost minor',report.totals.paidCostMinor]];
 return {filename:'TechOrbit_Bonus_Stock_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function bonusStockXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),report=bonusStockSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Bonus Stock');
 sheet.addRow(['TechOrbit Pharmacy POS - Bonus Stock/Scheme Report']);sheet.addRow(['From',report.range.from,'To',report.range.to]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Supplier','Invoice','Medicine','Batch','Paid units','Bonus units','Purchased base units','Bonus base units','Received base units','Paid cost PKR','Effective unit cost PKR']);
 for(const r of report.items)sheet.addRow([r.day,r.supplier,r.invoice,r.medicine,r.batch,r.purchasedQuantity,r.bonusQuantity,r.purchasedBaseQuantity,r.bonusBaseQuantity,r.receivedBaseQuantity,r.paidCostMinor/100,r.effectiveUnitCostMinor/100]);
 sheet.addRow([]);sheet.addRow(['Total bonus base units',report.totals.bonusBaseQuantity]);sheet.addRow(['Total paid cost PKR',report.totals.paidCostMinor/100]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:12},(_,i)=>({width:i<5?22:18}));
 return {filename:'TechOrbit_Bonus_Stock_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function bonusStockPdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),report=bonusStockSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Bonus Stock/Scheme Report');line(`${report.range.from} to ${report.range.to}`);
 line('Purchased base units',report.totals.purchasedBaseQuantity);line('Bonus base units',report.totals.bonusBaseQuantity);
 line('Paid purchase cost',`PKR ${(report.totals.paidCostMinor/100).toFixed(2)}`);line('Medicine / supplier / invoice','Bonus units');
 for(const row of report.items)line(`${row.medicine} / ${row.supplier} / ${row.invoice}`,row.bonusBaseQuantity);
 return {filename:'TechOrbit_Bonus_Stock_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={bonusStockSummary,bonusStockEntries,bonusStockCsv,bonusStockXlsx,bonusStockPdf};
