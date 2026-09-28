const {dayKey}=require('./ranges.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
function data(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid expiry report filters');
 for(const key of ['q','generic','category','brand','supplier']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid expiry report filters');
  if(String(input[key]||'').length>100)throw Error('Expiry report filter is too long');
 }
 const horizon=input.horizon||'all';
 if(!['all','expired','30','60','90','safe','none'].includes(horizon))throw Error('Choose a valid expiry horizon');
 const asOfDate=dayKey(options.now||new Date()),costVisible=Boolean(options.costVisible),clauses=['b.quantity_on_hand>0'],args=[];
 if(input.q?.trim()){clauses.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR b.batch_number LIKE ? ESCAPE '\\')");args.push(like(input.q.trim()),like(input.q.trim()),like(input.q.trim()))}
 for(const [key,column] of [['generic','p.generic_name'],['category','p.category'],['brand','p.manufacturer'],['supplier','s.name']]){
  if(input[key]?.trim()){clauses.push(`${column} LIKE ? ESCAPE '\\'`);args.push(like(input[key].trim()))}
 }
 const rows=db.prepare(`SELECT b.id batch_id,b.product_id,b.batch_number,b.expiry_date,b.quantity_on_hand,b.unit_cost_minor,
  p.sku,p.name medicine,p.generic_name generic,p.category,p.manufacturer brand,p.base_unit,p.active,
  s.name supplier,
  COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) effective_cost_minor
  FROM ProductBatches b JOIN Products p ON p.id=b.product_id LEFT JOIN Suppliers s ON s.id=b.supplier_id
  WHERE ${clauses.join(' AND ')} ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END,b.expiry_date,p.name,b.id`).all(...args);
 if(rows.length>10000)throw Error('Expiry report exceeds 10,000 batches; narrow the filters');
 const items=rows.map(row=>{
  const physicalQuantity=Number(row.quantity_on_hand),daysToExpiry=row.expiry_date===null?null:
   Math.ceil((Date.parse(`${row.expiry_date}T00:00:00Z`)-Date.parse(`${asOfDate}T00:00:00Z`))/86400000);
  const band=daysToExpiry===null?'none':daysToExpiry<=0?'expired':daysToExpiry<=30?'30':daysToExpiry<=60?'60':daysToExpiry<=90?'90':'safe';
  const sellableQuantity=Boolean(row.active)&&band!=='expired'?physicalQuantity:0;
  const effectiveCostMinor=costVisible?Number(row.effective_cost_minor):null;
  return {batchId:row.batch_id,productId:row.product_id,sku:row.sku||'',medicine:row.medicine,generic:row.generic||'',category:row.category||'',
   brand:row.brand||'',supplier:row.supplier||'',batch:row.batch_number||'',expiryDate:row.expiry_date||'',baseUnit:row.base_unit,
   active:Boolean(row.active),daysToExpiry,band,physicalQuantity,sellableQuantity,
   physicalValueMinor:costVisible?Math.round(effectiveCostMinor*physicalQuantity):null,
   sellableValueMinor:costVisible?Math.round(effectiveCostMinor*sellableQuantity):null};
 }).filter(row=>horizon==='all'||(horizon==='30'||horizon==='60'||horizon==='90'?
  row.daysToExpiry!==null&&row.daysToExpiry>0&&row.daysToExpiry<=Number(horizon):row.band===horizon));
 return {asOfDate,horizon,costVisible,items};
}
function expirySummary(db,input={},options={}){
 const {asOfDate,horizon,costVisible,items}=data(db,input,options),bands=['expired','30','60','90','safe','none'];
 const groups=bands.map(band=>{
  const selected=items.filter(row=>row.band===band);
  return {band,batchCount:selected.length,physicalQuantity:selected.reduce((sum,row)=>sum+row.physicalQuantity,0),
   sellableQuantity:selected.reduce((sum,row)=>sum+row.sellableQuantity,0),
   physicalValueMinor:costVisible?selected.reduce((sum,row)=>sum+row.physicalValueMinor,0):null,
   sellableValueMinor:costVisible?selected.reduce((sum,row)=>sum+row.sellableValueMinor,0):null};
 });
 const totals={batchCount:items.length,physicalQuantity:groups.reduce((sum,row)=>sum+row.physicalQuantity,0),
  sellableQuantity:groups.reduce((sum,row)=>sum+row.sellableQuantity,0),
  physicalValueMinor:costVisible?groups.reduce((sum,row)=>sum+row.physicalValueMinor,0):null,
  sellableValueMinor:costVisible?groups.reduce((sum,row)=>sum+row.sellableValueMinor,0):null};
 return {asOfDate,horizon,costVisible,items,groups,totals,scope:'Live positive-stock batch snapshot in Pakistan civil date. Expired includes expiry today and is not sellable. Next 30/60/90-day filters are cumulative, exclude expired batches and include the final day. Bands in totals are exclusive. Values use the same effective batch cost convention as live inventory and are estimates, not a posted ledger balance.'};
}
function expiryEntries(db,input={},options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function expiryCsv(db,input={},options={}){
 const report=expirySummary(db,input,options),headers=['Medicine','SKU','Batch','Supplier','Expiry date','Days to expiry','Band','Physical units','Sellable units'];
 if(report.costVisible)headers.push('Physical value minor','Sellable value minor');
 const rows=[['Expiry Report'],['As of',report.asOfDate],['Horizon',report.horizon],['Scope',report.scope],[],headers,
 ...report.items.map(r=>{const row=[r.medicine,r.sku,r.batch,r.supplier,r.expiryDate,r.daysToExpiry??'',r.band,r.physicalQuantity,r.sellableQuantity];if(report.costVisible)row.push(r.physicalValueMinor,r.sellableValueMinor);return row}),[],
 ['Total physical units',report.totals.physicalQuantity],['Total sellable units',report.totals.sellableQuantity]];
 if(report.costVisible)rows.push(['Total physical value minor',report.totals.physicalValueMinor],['Total sellable value minor',report.totals.sellableValueMinor]);
 return {filename:'TechOrbit_Expiry_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function expiryXlsx(db,input={},options={}){
 const ExcelJS=require('exceljs'),report=expirySummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Expiry');
 sheet.addRow(['TechOrbit Pharmacy POS - Expiry Report']);sheet.addRow(['As of',report.asOfDate,'Horizon',report.horizon]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 const headers=['Medicine','SKU','Batch','Supplier','Expiry date','Days to expiry','Band','Physical units','Sellable units'];
 if(report.costVisible)headers.push('Physical value PKR','Sellable value PKR');sheet.addRow(headers);
 for(const r of report.items){const row=[r.medicine,r.sku,r.batch,r.supplier,r.expiryDate,r.daysToExpiry??'',r.band,r.physicalQuantity,r.sellableQuantity];if(report.costVisible)row.push(r.physicalValueMinor/100,r.sellableValueMinor/100);sheet.addRow(row)}
 sheet.addRow([]);sheet.addRow(['Total physical units',report.totals.physicalQuantity]);sheet.addRow(['Total sellable units',report.totals.sellableQuantity]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:headers.length},(_,i)=>({width:i<5?22:18}));
 return {filename:'TechOrbit_Expiry_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function expiryPdf(db,input={},options={}){
 const {jsPDF}=require('jspdf'),report=expirySummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Expiry Report');line(`As of ${report.asOfDate} / ${report.horizon}`);
 line('Physical units',report.totals.physicalQuantity);line('Sellable units',report.totals.sellableQuantity);
 if(report.costVisible)line('Physical value',`PKR ${(report.totals.physicalValueMinor/100).toFixed(2)}`);
 line('Medicine / batch / expiry','Physical / sellable');for(const row of report.items)line(`${row.medicine} / ${row.batch} / ${row.expiryDate||'none'}`,`${row.physicalQuantity} / ${row.sellableQuantity}`);
 return {filename:'TechOrbit_Expiry_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={expirySummary,expiryEntries,expiryCsv,expiryXlsx,expiryPdf};
