const {reportRange}=require('./reports.cjs');

const clean=value=>String(value||'').trim().toLocaleLowerCase('en-US');
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';

function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid return report filters');
 for(const key of ['product','generic','category','brand','supplier','customer','cashier']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid return report filters');
  if(String(input[key]||'').length>100)throw Error('Return report filter is too long');
 }
 const range=reportRange(input,options.now),dayMode=input.dayMode||'official';
 if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
 if(input.method&&!['cash','card','digital','credit'].includes(input.method))throw Error('Choose a valid payment method');
 const day=dayMode==='official'?`COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
  WHERE julianday(r.returned_at)>=julianday(bd.opened_at) AND (bd.closed_at IS NULL OR julianday(r.returned_at)<julianday(bd.closed_at))
  ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',r.returned_at,'+5 hours'))`:
  `strftime('%Y-%m-%d',r.returned_at,'+5 hours')`;
 const conditions=['day>=?','day<=?'],args=[range.from,range.to];
 if(input.customer?.trim()){conditions.push("(customer LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");args.push(like(input.customer.trim()),like(input.customer.trim()))}
 if(input.cashier?.trim()){conditions.push("cashier LIKE ? ESCAPE '\\'");args.push(like(input.cashier.trim()))}
 if(input.method){conditions.push('method=?');args.push(input.method)}
 const events=db.prepare(`WITH returns AS (SELECT r.*,s.invoice_number,s.customer_name_snapshot customer,s.customer_phone_snapshot phone,
  s.payment_method method,u.display_name cashier,${day} day FROM SaleReturns r JOIN Sales s ON s.id=r.sale_id
  LEFT JOIN Users u ON u.id=s.created_by) SELECT * FROM returns WHERE ${conditions.join(' AND ')} ORDER BY julianday(returned_at) DESC,id DESC`).all(...args);
 if(events.length>10000)throw Error('Return report exceeds 10,000 returns; narrow the dates or filters');
 const itemQuery=db.prepare(`SELECT ri.*,si.product_name_snapshot medicine,si.generic_name_snapshot generic,p.sku,p.category,p.manufacturer brand
  FROM SaleReturnItems ri JOIN SaleItems si ON si.id=ri.sale_item_id JOIN Products p ON p.id=ri.product_id
  WHERE ri.sale_return_id=? ORDER BY ri.id`);
 const supplierQuery=db.prepare(`SELECT 1 FROM SaleReturnAllocations ra JOIN ProductBatches b ON b.id=ra.batch_id
  JOIN Suppliers sup ON sup.id=b.supplier_id WHERE ra.sale_return_item_id=? AND lower(sup.name) LIKE ? ESCAPE '\\' LIMIT 1`);
 const rows=[];
 for(const event of events){
  const lines=itemQuery.all(event.id);let cumulative=0;
  if(!lines.length||lines.reduce((sum,line)=>sum+line.refund_minor,0)!==event.total_minor)throw Error('Saved return lines do not reconcile to the return total');
  for(const line of lines){
   const end=cumulative+line.refund_minor,start=cumulative;cumulative=end;
   if(input.product?.trim()&&!clean(line.medicine).includes(clean(input.product))&&!clean(line.sku).includes(clean(input.product)))continue;
   if(input.generic?.trim()&&!clean(line.generic).includes(clean(input.generic)))continue;
   if(input.category?.trim()&&!clean(line.category).includes(clean(input.category)))continue;
   if(input.brand?.trim()&&!clean(line.brand).includes(clean(input.brand)))continue;
   if(input.supplier?.trim()&&!supplierQuery.get(line.id,like(clean(input.supplier))))continue;
   const share=value=>event.total_minor?Math.round(value*end/event.total_minor)-Math.round(value*start/event.total_minor):0;
   rows.push({id:line.id,returnId:event.id,saleId:event.sale_id,day:event.day,returnedAt:event.returned_at,
    invoice:event.invoice_number,customer:event.customer||'',cashier:event.cashier||'',method:event.method,
    medicine:line.medicine,generic:line.generic||'',category:line.category||'',brand:line.brand||'',
    quantity:Number(line.base_quantity),restockQuantity:line.restockable?Number(line.base_quantity):0,
    disposalQuantity:line.restockable?0:Number(line.base_quantity),reason:event.reason,
    returnMinor:line.refund_minor,gstMinor:line.gst_minor,refundMinor:share(event.refund_minor),
    receivableCreditMinor:share(event.receivable_credit_minor),cogsMinor:line.cogs_minor});
   if(rows.length>20000)throw Error('Return report exceeds 20,000 lines; narrow the dates or filters');
  }
 }
 return {range:{from:range.from,to:range.to},dayMode,rows};
}

function customerReturnSummary(db,input,options={}){
 const {range,dayMode,rows}=data(db,input,options),groups=new Map();
 const totals={returnMinor:0,gstMinor:0,refundMinor:0,receivableCreditMinor:0,cogsMinor:0,quantity:0,restockQuantity:0,disposalQuantity:0,returnCount:0};
 const seen=new Set();
 for(const row of rows){
  const key=String(row.returnId),group=groups.get(key)||{returnId:row.returnId,day:row.day,invoice:row.invoice,customer:row.customer,
   cashier:row.cashier,method:row.method,reason:row.reason,...Object.fromEntries(Object.keys(totals).map(field=>[field,0]))};
  for(const field of ['returnMinor','gstMinor','refundMinor','receivableCreditMinor','cogsMinor','quantity','restockQuantity','disposalQuantity']){
   group[field]+=row[field];totals[field]+=row[field];
  }
  if(!seen.has(key)){group.returnCount=1;totals.returnCount++;seen.add(key)}
  groups.set(key,group);
 }
 const costVisible=Boolean(options.costVisible),protect=row=>costVisible?row:{...row,cogsMinor:null};
 return {range,dayMode,groups:[...groups.values()].map(protect),totals:protect(totals),costVisible,
  scope:'Product, generic, category, brand and recorded batch supplier filters select return lines. Refund and receivable-credit amounts are allocated across saved lines by returned value; unfiltered totals reconcile to posted returns. Category and brand use current product metadata. Official day follows its opening date.'};
}

function customerReturnEntries(db,input,options={}){
 const {rows}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:rows.length>page*pageSize,items:rows.slice((page-1)*pageSize,page*pageSize).map(row=>options.costVisible?row:{...row,cogsMinor:null})};
}

function customerReturnCsv(db,input,options={}){
 const summary=customerReturnSummary(db,input,options),rows=data(db,input,options).rows;
 const out=[['Customer Return Report'],['Range',summary.range.from,summary.range.to],['Day grouping',summary.dayMode],['Scope',summary.scope],[],
  ['Day','Invoice','Return ID','Customer','Cashier','Original payment method','Reason','Medicine','Quantity','Restocked quantity','Disposed quantity','Return minor','GST minor','Cash refund minor','Receivable credit minor',...(summary.costVisible?['COGS reversal minor']:[])],
  ...rows.map(r=>[r.day,r.invoice,r.returnId,r.customer,r.cashier,r.method,r.reason,r.medicine,r.quantity,r.restockQuantity,r.disposalQuantity,r.returnMinor,r.gstMinor,r.refundMinor,r.receivableCreditMinor,...(summary.costVisible?[r.cogsMinor]:[])]),[],
  ['Total returns minor',summary.totals.returnMinor],['Total GST minor',summary.totals.gstMinor],['Total cash refund minor',summary.totals.refundMinor],
  ['Total receivable credit minor',summary.totals.receivableCreditMinor],['Return count',summary.totals.returnCount],
  ...(summary.costVisible?[['Total COGS reversal minor',summary.totals.cogsMinor]]:[])];
 return {filename:'TechOrbit_Customer_Return_Report.csv',csv:'\uFEFF'+out.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}

async function customerReturnXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),summary=customerReturnSummary(db,input,options),rows=data(db,input,options).rows;
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Customer Returns');
 sheet.addRow(['TechOrbit Pharmacy POS - Customer Return Report']);sheet.addRow(['From',summary.range.from,'To',summary.range.to]);sheet.addRow(['Scope',summary.scope]);sheet.addRow([]);
 sheet.addRow(['Day','Invoice','Return ID','Customer','Cashier','Method','Medicine','Quantity','Restocked','Disposed','Return PKR','GST PKR','Cash refund PKR','Receivable credit PKR',...(summary.costVisible?['COGS reversal PKR']:[])]);
 for(const r of rows)sheet.addRow([r.day,r.invoice,r.returnId,r.customer,r.cashier,r.method,r.medicine,r.quantity,r.restockQuantity,r.disposalQuantity,r.returnMinor/100,r.gstMinor/100,r.refundMinor/100,r.receivableCreditMinor/100,...(summary.costVisible?[r.cogsMinor/100]:[])]);
 sheet.addRow([]);for(const [label,value] of [['Total returns PKR',summary.totals.returnMinor],['Total GST PKR',summary.totals.gstMinor],['Total cash refund PKR',summary.totals.refundMinor],['Total receivable credit PKR',summary.totals.receivableCreditMinor]])sheet.addRow([label,value/100]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:15},(_,i)=>({width:i<7?23:18}));
 return {filename:'TechOrbit_Customer_Return_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}

function customerReturnPdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),summary=customerReturnSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Customer Return Report');line(`${summary.range.from} to ${summary.range.to}`);
 for(const [label,value] of [['Returns',summary.totals.returnMinor],['GST reversed',summary.totals.gstMinor],['Cash refunds',summary.totals.refundMinor],['Receivable credits',summary.totals.receivableCreditMinor]])line(label,`PKR ${(value/100).toFixed(2)}`);
 line('Invoice / customer','Return PKR');for(const row of summary.groups)line(`${row.invoice} / ${row.customer}`,(row.returnMinor/100).toFixed(2));
 return {filename:'TechOrbit_Customer_Return_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}

module.exports={customerReturnSummary,customerReturnEntries,customerReturnCsv,customerReturnXlsx,customerReturnPdf};
