const {reportRange}=require('./reports.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const types=['opening','purchase','sale','sale_return','purchase_return','adjustment','transfer'];
function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid movement report filters');
 for(const key of ['product','generic','category','brand','supplier','batch','reference']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid movement report filters');
  if(String(input[key]||'').length>100)throw Error('Movement report filter is too long');
 }
 const range=reportRange(input,options.now),dayMode=input.dayMode||'official',type=input.type||'all';
 if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
 if(type!=='all'&&!types.includes(type))throw Error('Choose a valid movement type');
 const day=dayMode==='official'?`COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
  WHERE julianday(im.occurred_at)>=julianday(bd.opened_at) AND (bd.closed_at IS NULL OR julianday(im.occurred_at)<julianday(bd.closed_at))
  ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',im.occurred_at,'+5 hours'))`:
  `strftime('%Y-%m-%d',im.occurred_at,'+5 hours')`;
 const clauses=['day>=?','day<=?'],args=[range.from,range.to];
 if(type!=='all'){clauses.push('movement_type=?');args.push(type)}
 for(const [key,column] of [['product','medicine'],['generic','generic'],['category','category'],['brand','brand'],['supplier','supplier'],['batch','batch'],['reference','reference_id']]){
  if(input[key]?.trim()){clauses.push(`${column} LIKE ? ESCAPE '\\'`);args.push(like(input[key].trim()))}
 }
 const rows=db.prepare(`WITH source AS (SELECT im.id,im.product_id,im.batch_id,im.movement_type,im.quantity_delta,
  im.reference_type,im.reference_id,im.occurred_at,im.note,${day} day,
  p.name medicine,p.sku,p.generic_name generic,p.category,p.manufacturer brand,p.base_unit,
  b.batch_number batch,b.expiry_date,s.name supplier,u.display_name user_name
  FROM InventoryMovements im JOIN Products p ON p.id=im.product_id
  LEFT JOIN ProductBatches b ON b.id=im.batch_id LEFT JOIN Suppliers s ON s.id=b.supplier_id
  LEFT JOIN Users u ON u.id=im.user_id)
  SELECT * FROM source WHERE ${clauses.join(' AND ')} ORDER BY julianday(occurred_at) DESC,id DESC`).all(...args);
 if(rows.length>20000)throw Error('Movement report exceeds 20,000 rows; narrow the dates or filters');
 const items=rows.map(r=>({id:r.id,day:r.day,occurredAt:r.occurred_at,productId:r.product_id,batchId:r.batch_id,
  medicine:r.medicine,sku:r.sku||'',generic:r.generic||'',category:r.category||'',brand:r.brand||'',baseUnit:r.base_unit,
  batch:r.batch||'',expiryDate:r.expiry_date||'',supplier:r.supplier||'',type:r.movement_type,quantityDelta:Number(r.quantity_delta),
  referenceType:r.reference_type,referenceId:r.reference_id||'',note:r.note||'',userName:r.user_name||''}));
 return {range:{from:range.from,to:range.to},dayMode,items};
}
function stockMovementSummary(db,input,options={}){
 const {range,dayMode,items}=data(db,input,options),groups=types.map(type=>{
  const selected=items.filter(row=>row.type===type);
  return {type,count:selected.length,inQuantity:selected.reduce((sum,row)=>sum+Math.max(row.quantityDelta,0),0),
   outQuantity:selected.reduce((sum,row)=>sum+Math.max(-row.quantityDelta,0),0),netQuantity:selected.reduce((sum,row)=>sum+row.quantityDelta,0)};
 });
 const totals={count:items.length,inQuantity:groups.reduce((sum,row)=>sum+row.inQuantity,0),outQuantity:groups.reduce((sum,row)=>sum+row.outQuantity,0),netQuantity:groups.reduce((sum,row)=>sum+row.netQuantity,0)};
 if(totals.netQuantity!==totals.inQuantity-totals.outQuantity)throw Error('Movement totals do not reconcile');
 return {range,dayMode,items,groups,totals,scope:'Signed quantities come from saved InventoryMovements rows. Positive is stock in; negative is stock out. Type groups sum to the selected period ledger rows. This is a movement period, not a reconstructed historical opening/closing stock balance.'};
}
function stockMovementEntries(db,input,options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function stockMovementCsv(db,input,options={}){
 const report=stockMovementSummary(db,input,options),rows=[['Stock Movement Report'],['Range',report.range.from,report.range.to],['Day grouping',report.dayMode],['Scope',report.scope],[],
 ['Day','Occurred at','Type','Medicine','SKU','Batch','Supplier','Quantity delta','Base unit','Reference type','Reference ID','User','Note'],
 ...report.items.map(r=>[r.day,r.occurredAt,r.type,r.medicine,r.sku,r.batch,r.supplier,r.quantityDelta,r.baseUnit,r.referenceType,r.referenceId,r.userName,r.note]),[],
 ['Total stock in',report.totals.inQuantity],['Total stock out',report.totals.outQuantity],['Net movement',report.totals.netQuantity]];
 return {filename:'TechOrbit_Stock_Movement_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function stockMovementXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),report=stockMovementSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Stock Movement');
 sheet.addRow(['TechOrbit Pharmacy POS - Stock Movement Report']);sheet.addRow(['From',report.range.from,'To',report.range.to]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Occurred at','Type','Medicine','SKU','Batch','Supplier','Quantity delta','Base unit','Reference type','Reference ID','User','Note']);
 for(const r of report.items)sheet.addRow([r.day,r.occurredAt,r.type,r.medicine,r.sku,r.batch,r.supplier,r.quantityDelta,r.baseUnit,r.referenceType,r.referenceId,r.userName,r.note]);
 sheet.addRow([]);sheet.addRow(['Stock in',report.totals.inQuantity]);sheet.addRow(['Stock out',report.totals.outQuantity]);sheet.addRow(['Net movement',report.totals.netQuantity]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:13},(_,i)=>({width:i<7?22:18}));
 return {filename:'TechOrbit_Stock_Movement_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function stockMovementPdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),report=stockMovementSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Stock Movement Report');line(`${report.range.from} to ${report.range.to}`);
 line('Stock in',report.totals.inQuantity);line('Stock out',report.totals.outQuantity);line('Net movement',report.totals.netQuantity);
 line('Type / medicine / batch','Delta');for(const row of report.items)line(`${row.type} / ${row.medicine} / ${row.batch}`,row.quantityDelta);
 return {filename:'TechOrbit_Stock_Movement_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={stockMovementSummary,stockMovementEntries,stockMovementCsv,stockMovementXlsx,stockMovementPdf};
