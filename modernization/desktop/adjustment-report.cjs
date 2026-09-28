const movement=require('./stock-movement-report.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
function adjustmentSummary(db,input,options={}){
 const kind=input?.kind||'all';if(!['all','gain','loss','disposal','return_disposal'].includes(kind))throw Error('Choose a valid adjustment kind');
 const report=movement.stockMovementSummary(db,{...input,type:'adjustment'},options);
 const items=report.items.map(row=>{
  if(row.referenceType==='stock_adjustment'){
   const original=db.prepare(`SELECT a.adjustment_type,a.reason,i.quantity_delta,i.previous_quantity,i.new_quantity
    FROM StockAdjustments a JOIN StockAdjustmentItems i ON i.adjustment_id=a.id
    WHERE a.id=? AND i.batch_id=? AND i.product_id=?`).get(row.referenceId,row.batchId,row.productId);
   if(!original||original.quantity_delta!==row.quantityDelta||original.new_quantity-original.previous_quantity!==row.quantityDelta)
    throw Error('Saved adjustment does not reconcile to its movement');
   return {...row,kind:original.adjustment_type,reason:original.reason,previousQuantity:original.previous_quantity,newQuantity:original.new_quantity};
  }
  if(row.referenceType==='sale_return_disposal'){
   const original=db.prepare(`SELECT SUM(a.base_quantity) quantity FROM SaleReturnAllocations a
    JOIN SaleReturnItems i ON i.id=a.sale_return_item_id WHERE i.sale_return_id=? AND i.restockable=0 AND a.batch_id=? AND i.product_id=?`).get(row.referenceId,row.batchId,row.productId);
   const signed=db.prepare(`SELECT SUM(quantity_delta) quantity FROM InventoryMovements WHERE reference_type='sale_return_disposal' AND reference_id=? AND batch_id=? AND product_id=?`).get(row.referenceId,row.batchId,row.productId);
   if(!original||-original.quantity!==signed.quantity)throw Error('Customer return disposal does not reconcile to its allocations');
   return {...row,kind:'return_disposal',reason:row.note,previousQuantity:null,newQuantity:null};
  }
  throw Error('Adjustment movement has an unsupported source; reconcile it before reporting');
 }).filter(row=>kind==='all'||row.kind===kind);
 const groups=['gain','loss','disposal','return_disposal'].map(kind=>{
  const selected=items.filter(row=>row.kind===kind);return {kind,count:selected.length,inQuantity:selected.reduce((sum,row)=>sum+Math.max(row.quantityDelta,0),0),outQuantity:selected.reduce((sum,row)=>sum+Math.max(-row.quantityDelta,0),0),netQuantity:selected.reduce((sum,row)=>sum+row.quantityDelta,0)};
 });
 const totals={count:items.length,inQuantity:groups.reduce((sum,row)=>sum+row.inQuantity,0),outQuantity:groups.reduce((sum,row)=>sum+row.outQuantity,0),netQuantity:groups.reduce((sum,row)=>sum+row.netQuantity,0)};
 return {range:report.range,dayMode:report.dayMode,items,groups,totals,scope:'Saved stock adjustment movements are reconciled to original adjustment items or non-sellable customer return allocations. Gain, loss, manual disposal and return disposal remain separate. Previous/new quantity is shown only when stored by the original adjustment. No historical disposal cost is inferred from current batch prices.'};
}
function adjustmentEntries(db,input,options={}){
 const {items}=adjustmentSummary(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function adjustmentCsv(db,input,options={}){
 const r=adjustmentSummary(db,input,options),rows=[['Stock Adjustment/Disposal Report'],['Range',r.range.from,r.range.to],['Scope',r.scope],[],
 ['Day','Kind','Medicine','Batch','Delta','Previous','New','Source','Reference','User','Reason'],
 ...r.items.map(x=>[x.day,x.kind,x.medicine,x.batch,x.quantityDelta,x.previousQuantity,x.newQuantity,x.referenceType,x.referenceId,x.userName,x.reason]),[],['Stock in',r.totals.inQuantity],['Stock out',r.totals.outQuantity],['Net adjustment',r.totals.netQuantity]];
 return {filename:'TechOrbit_Stock_Adjustment_Disposal_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function adjustmentXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),r=adjustmentSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Adjustments');
 sheet.addRow(['Stock Adjustment/Disposal Report']);sheet.addRow(['From',r.range.from,'To',r.range.to]);sheet.addRow(['Scope',r.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Kind','Medicine','Batch','Delta','Previous','New','Source','Reference','User','Reason']);
 for(const x of r.items)sheet.addRow([x.day,x.kind,x.medicine,x.batch,x.quantityDelta,x.previousQuantity,x.newQuantity,x.referenceType,x.referenceId,x.userName,x.reason]);
 sheet.addRow(['Net adjustment',r.totals.netQuantity]);sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:11},()=>({width:22}));
 return {filename:'TechOrbit_Stock_Adjustment_Disposal_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function adjustmentPdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),r=adjustmentSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});let y=42;
 const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('Stock Adjustment/Disposal Report');line(`${r.range.from} to ${r.range.to}`);line('Stock in',r.totals.inQuantity);line('Stock out',r.totals.outQuantity);line('Net adjustment',r.totals.netQuantity);
 for(const x of r.items)line(`${x.kind} / ${x.medicine} / ${x.batch}`,x.quantityDelta);
 return {filename:'TechOrbit_Stock_Adjustment_Disposal_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={adjustmentSummary,adjustmentEntries,adjustmentCsv,adjustmentXlsx,adjustmentPdf};
