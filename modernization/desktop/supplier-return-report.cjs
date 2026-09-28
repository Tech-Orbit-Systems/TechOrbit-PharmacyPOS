const {reportRange}=require('./reports.cjs');
const clean=value=>String(value||'').trim().toLocaleLowerCase('en-US');
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';

function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid supplier return filters');
 for(const key of ['supplier','product','generic','category','brand','batch']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid supplier return filters');
  if(String(input[key]||'').length>100)throw Error('Supplier return filter is too long');
 }
 const range=reportRange(input,options.now),dayMode=input.dayMode||'official';
 if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
 const day=dayMode==='official'?`COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
  WHERE julianday(r.returned_at)>=julianday(bd.opened_at) AND (bd.closed_at IS NULL OR julianday(r.returned_at)<julianday(bd.closed_at))
  ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',r.returned_at,'+5 hours'))`:
  `strftime('%Y-%m-%d',r.returned_at,'+5 hours')`;
 const clauses=['day>=?','day<=?'],args=[range.from,range.to];
 if(input.supplier?.trim()){clauses.push("supplier LIKE ? ESCAPE '\\'");args.push(like(input.supplier.trim()))}
 const events=db.prepare(`WITH returns AS (SELECT r.*,p.invoice_number,s.name supplier,${day} day FROM PurchaseReturns r
  JOIN Purchases p ON p.id=r.purchase_id JOIN Suppliers s ON s.id=r.supplier_id)
  SELECT * FROM returns WHERE ${clauses.join(' AND ')} ORDER BY julianday(returned_at) DESC,id DESC`).all(...args);
 if(events.length>10000)throw Error('Supplier return report exceeds 10,000 returns; narrow the dates or filters');
 const itemQuery=db.prepare(`SELECT ri.*,p.name medicine,p.generic_name generic,p.sku,p.category,p.manufacturer brand,
  b.batch_number batch,b.expiry_date FROM PurchaseReturnItems ri JOIN Products p ON p.id=ri.product_id
  JOIN ProductBatches b ON b.id=ri.batch_id WHERE ri.purchase_return_id=? ORDER BY ri.id`);
 const rows=[];
 for(const event of events){
  const lines=itemQuery.all(event.id),lineTotal=lines.reduce((sum,line)=>sum+line.line_total_minor,0);
  if(!lines.length||lineTotal!==event.total_minor)throw Error('Saved supplier return lines do not reconcile to the return total');
  let cumulative=0;
  for(const line of lines){
   const start=cumulative,end=start+line.line_total_minor;cumulative=end;
   if(input.product?.trim()&&!clean(line.medicine).includes(clean(input.product))&&!clean(line.sku).includes(clean(input.product)))continue;
   if(input.generic?.trim()&&!clean(line.generic).includes(clean(input.generic)))continue;
   if(input.category?.trim()&&!clean(line.category).includes(clean(input.category)))continue;
   if(input.brand?.trim()&&!clean(line.brand).includes(clean(input.brand)))continue;
   if(input.batch?.trim()&&!clean(line.batch).includes(clean(input.batch)))continue;
   const share=value=>event.total_minor?Math.round(value*end/event.total_minor)-Math.round(value*start/event.total_minor):0;
   rows.push({id:line.id,returnId:event.id,purchaseId:event.purchase_id,day:event.day,returnedAt:event.returned_at,
    invoice:event.invoice_number||'',supplier:event.supplier,reason:event.reason,medicine:line.medicine,generic:line.generic||'',
    category:line.category||'',brand:line.brand||'',batch:line.batch||'',expiryDate:line.expiry_date||'',
    quantity:Number(line.quantity),returnMinor:line.line_total_minor,payableCreditMinor:share(event.payable_credit_minor),
    refundMinor:share(event.refund_minor),refundMethod:event.refund_method||''});
   if(rows.length>20000)throw Error('Supplier return report exceeds 20,000 lines; narrow the dates or filters');
  }
 }
 return {range:{from:range.from,to:range.to},dayMode,rows};
}

function supplierReturnSummary(db,input,options={}){
 const {range,dayMode,rows}=data(db,input,options),groups=new Map(),seen=new Set();
 const totals={returnMinor:0,payableCreditMinor:0,refundMinor:0,quantity:0,returnCount:0};
 for(const row of rows){
  const key=String(row.returnId),group=groups.get(key)||{returnId:row.returnId,day:row.day,invoice:row.invoice,
   supplier:row.supplier,reason:row.reason,refundMethod:row.refundMethod,...Object.fromEntries(Object.keys(totals).map(field=>[field,0]))};
  for(const field of ['returnMinor','payableCreditMinor','refundMinor','quantity']){group[field]+=row[field];totals[field]+=row[field]}
  if(!seen.has(key)){group.returnCount=1;totals.returnCount++;seen.add(key)}
  groups.set(key,group);
 }
 return {range,dayMode,groups:[...groups.values()],totals,
  scope:'Product, generic, current category/brand and original batch filters select saved supplier-return lines. Payable credit and actual supplier refund are allocated by line value; unfiltered lines must reconcile to saved return headers. Official day follows its opening date.'};
}
function supplierReturnEntries(db,input,options={}){
 const rows=data(db,input,options).rows,page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:rows.length>page*pageSize,items:rows.slice((page-1)*pageSize,page*pageSize)};
}
function supplierReturnCsv(db,input,options={}){
 const summary=supplierReturnSummary(db,input,options),rows=data(db,input,options).rows;
 const out=[['Supplier Return Report'],['Range',summary.range.from,summary.range.to],['Day grouping',summary.dayMode],['Scope',summary.scope],[],
  ['Day','Purchase invoice','Return ID','Supplier','Reason','Medicine','Batch','Expiry','Quantity','Return minor','Payable credit minor','Actual refund minor','Refund method'],
  ...rows.map(r=>[r.day,r.invoice,r.returnId,r.supplier,r.reason,r.medicine,r.batch,r.expiryDate,r.quantity,r.returnMinor,r.payableCreditMinor,r.refundMinor,r.refundMethod]),[],
  ['Total supplier returns minor',summary.totals.returnMinor],['Total payable credit minor',summary.totals.payableCreditMinor],
  ['Total actual refund minor',summary.totals.refundMinor],['Return count',summary.totals.returnCount]];
 return {filename:'TechOrbit_Supplier_Return_Report.csv',csv:'\uFEFF'+out.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function supplierReturnXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),summary=supplierReturnSummary(db,input,options),rows=data(db,input,options).rows;
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Supplier Returns');
 sheet.addRow(['TechOrbit Pharmacy POS - Supplier Return Report']);sheet.addRow(['From',summary.range.from,'To',summary.range.to]);sheet.addRow(['Scope',summary.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Purchase invoice','Return ID','Supplier','Reason','Medicine','Batch','Expiry','Quantity','Return PKR','Payable credit PKR','Actual refund PKR','Refund method']);
 for(const r of rows)sheet.addRow([r.day,r.invoice,r.returnId,r.supplier,r.reason,r.medicine,r.batch,r.expiryDate,r.quantity,r.returnMinor/100,r.payableCreditMinor/100,r.refundMinor/100,r.refundMethod]);
 sheet.addRow([]);for(const [label,value] of [['Total supplier returns PKR',summary.totals.returnMinor],['Total payable credit PKR',summary.totals.payableCreditMinor],['Total actual refund PKR',summary.totals.refundMinor]])sheet.addRow([label,value/100]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:13},(_,i)=>({width:i<8?23:19}));
 return {filename:'TechOrbit_Supplier_Return_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function supplierReturnPdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),summary=supplierReturnSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Supplier Return Report');line(`${summary.range.from} to ${summary.range.to}`);
 for(const [label,value] of [['Returns',summary.totals.returnMinor],['Payable credits',summary.totals.payableCreditMinor],['Actual refunds',summary.totals.refundMinor]])line(label,`PKR ${(value/100).toFixed(2)}`);
 line('Purchase / supplier','Return PKR');for(const row of summary.groups)line(`${row.invoice} / ${row.supplier}`,(row.returnMinor/100).toFixed(2));
 return {filename:'TechOrbit_Supplier_Return_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={supplierReturnSummary,supplierReturnEntries,supplierReturnCsv,supplierReturnXlsx,supplierReturnPdf};
