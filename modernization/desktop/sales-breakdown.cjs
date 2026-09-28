const {dailySalesEntries}=require('./daily-sales.cjs');
const {reportRange}=require('./reports.cjs');

function sourceEntries(db,input,options){
 const entries=[];let page=1,result;
 do{
  result=dailySalesEntries(db,{...input,product:'',category:'',brand:'',supplier:'',page,pageSize:100},options);
  entries.push(...result.items);page++;
  if(entries.length>10000)throw Error('Report exceeds 10,000 invoices and returns; narrow the dates or filters');
 }while(result.hasMore);
 return entries;
}
function linesFor(db,event){
 if(event.kind==='sale'){
  const lines=db.prepare(`SELECT si.*,p.sku,p.category,p.manufacturer FROM SaleItems si
    JOIN Products p ON p.id=si.product_id WHERE si.sale_id=? ORDER BY si.line_number`).all(event.id);
  const sale=db.prepare('SELECT exact_total_minor,rounding_minor FROM Sales WHERE id=?').get(event.id);
  let cumulative=0;
  return lines.map(line=>{
   const end=cumulative+line.line_total_minor;
   const startRound=sale.exact_total_minor?Math.round(sale.rounding_minor*cumulative/sale.exact_total_minor):0;
   const endRound=sale.exact_total_minor?Math.round(sale.rounding_minor*end/sale.exact_total_minor):0;
   cumulative=end;
   return {...line,kind:'sale',eventId:event.id,occurred_at:event.occurred_at,day:event.day,reference:event.reference,
    customer:event.customer,cashier:event.cashier,method:event.method,quantity:Number(line.base_quantity),
    salesMinor:line.line_total_minor+endRound-startRound,returnsMinor:0,gstMinor:line.gst_minor,cogsMinor:line.cogs_minor,
    discountMinor:line.line_discount_minor+line.allocated_invoice_discount_minor};
  });
 }
 return db.prepare(`SELECT si.*,p.sku,p.category,p.manufacturer,ri.base_quantity return_quantity,
   ri.refund_minor,ri.gst_minor return_gst_minor,ri.cogs_minor return_cogs_minor
   FROM SaleReturnItems ri JOIN SaleItems si ON si.id=ri.sale_item_id JOIN Products p ON p.id=si.product_id
   WHERE ri.sale_return_id=? ORDER BY ri.id`).all(event.id).map(line=>({...line,kind:'return',eventId:event.id,
   occurred_at:event.occurred_at,day:event.day,reference:event.reference,customer:event.customer,
   cashier:event.cashier,method:event.method,quantity:Number(line.return_quantity),salesMinor:0,
   returnsMinor:line.refund_minor,gstMinor:-line.return_gst_minor,cogsMinor:-line.return_cogs_minor,
   discountMinor:0}));
}
const norm=x=>String(x||'').trim().toLocaleLowerCase('en-US');
function data(db,input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid report filters');
 for(const key of ['product','generic','category','brand','supplier','customer','cashier']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid report filters');
  if(String(input[key]||'').length>100)throw Error('Report filter is too long');
 }
 const events=sourceEntries(db,input,options),rows=[];
 const supplier=db.prepare(`SELECT 1 FROM SaleItemAllocations a JOIN ProductBatches b ON b.id=a.batch_id
  JOIN Suppliers sup ON sup.id=b.supplier_id WHERE a.sale_item_id=? AND lower(sup.name) LIKE ? ESCAPE '\\' LIMIT 1`);
 const safeLike=x=>`%${x.replace(/[\\%_]/g,'\\$&')}%`;
 for(const event of events)for(const line of linesFor(db,event)){
  if(input.product?.trim()&&!norm(line.product_name_snapshot).includes(norm(input.product))&&!norm(line.sku).includes(norm(input.product)))continue;
  if(input.generic?.trim()&&!norm(line.generic_name_snapshot).includes(norm(input.generic)))continue;
  if(input.category?.trim()&&!norm(line.category).includes(norm(input.category)))continue;
  if(input.brand?.trim()&&!norm(line.manufacturer).includes(norm(input.brand)))continue;
  if(input.supplier?.trim()&&!supplier.get(line.id,safeLike(norm(input.supplier))))continue;
  rows.push({...line,productName:line.product_name_snapshot,genericName:line.generic_name_snapshot,
   brand:line.manufacturer,netSalesMinor:line.salesMinor-line.returnsMinor,
   netExGstMinor:line.salesMinor-line.returnsMinor-line.gstMinor,
   grossProfitMinor:line.salesMinor-line.returnsMinor-line.gstMinor-line.cogsMinor,
   taxClass:line.taxable_minor>0||line.gst_rate_basis_points>0?'Taxable':
    line.line_total_minor>0||line.refund_minor>0?'Exempt':'Zero-value / unverified'});
  if(rows.length>20000)throw Error('Report exceeds 20,000 medicine lines; narrow the dates or filters');
 }
 return rows;
}
function medicineSummary(db,input,options={}){
 const groupBy=input.groupBy||'medicine';
 if(!['medicine','generic','category','brand','cashier','method','tax'].includes(groupBy))throw Error('Choose a valid sales grouping');
 const rows=data(db,input,options),groups=new Map();
 const totals={salesMinor:0,returnsMinor:0,netSalesMinor:0,gstMinor:0,netExGstMinor:0,taxableBaseMinor:0,discountMinor:0,cogsMinor:0,grossProfitMinor:0,soldQuantity:0,returnedQuantity:0};
 for(const row of rows){
  const label=groupBy==='generic'?(row.genericName||'Unspecified generic'):
    groupBy==='category'?(row.category||'Uncategorised'):
    groupBy==='brand'?(row.brand||'Unspecified brand'):
    groupBy==='cashier'?(row.cashier||'Unattributed cashier'):
    groupBy==='method'?(row.method||'Unspecified method'):
    groupBy==='tax'?row.taxClass:row.productName;
  const key=groupBy==='medicine'?`medicine:${row.product_id}`:`${groupBy}:${norm(label)}`;
  const group=groups.get(key)||{groupKey:key,groupLabel:label,productId:row.product_id,medicine:row.productName,generic:row.genericName||'',category:row.category||'',brand:row.brand||'',...Object.fromEntries(Object.keys(totals).map(field=>[field,0]))};
  for(const field of ['salesMinor','returnsMinor','netSalesMinor','gstMinor','netExGstMinor','discountMinor','cogsMinor','grossProfitMinor']){group[field]+=row[field];totals[field]+=row[field]}
  if(row.taxClass==='Taxable'){group.taxableBaseMinor+=row.netExGstMinor;totals.taxableBaseMinor+=row.netExGstMinor}
  if(row.kind==='sale'){group.soldQuantity+=row.quantity;totals.soldQuantity+=row.quantity}
  else{group.returnedQuantity+=row.quantity;totals.returnedQuantity+=row.quantity}
  groups.set(key,group);
 }
 const costVisible=Boolean(options.costVisible);
 const protect=row=>costVisible?row:{...row,cogsMinor:null,grossProfitMinor:null};
 return {groups:[...groups.values()].sort((a,b)=>b.netSalesMinor-a.netSalesMinor||a.groupLabel.localeCompare(b.groupLabel)).map(protect),
  totals:protect(totals),costVisible,groupBy,range:reportRange(input,options.now),
  scope:'Product filter selects medicine lines; category and brand use current product metadata. Cashier and payment method follow the original sale, including linked returns. Taxable/exempt uses saved sale-line taxable base and GST rate; zero-value lines without tax evidence stay unverified. Later due collections are separate from new sales. Invoice rounding follows the saved return rule.'};
}
function medicineEntries(db,input,options={}){
 const rows=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 const costVisible=Boolean(options.costVisible);
 const items=rows.slice((page-1)*pageSize,page*pageSize).map(row=>({day:row.day,occurred_at:row.occurred_at,kind:row.kind,
  reference:row.reference,medicine:row.productName,generic:row.genericName||'',taxClass:row.taxClass,quantity:row.quantity,
  salesMinor:row.salesMinor,returnsMinor:row.returnsMinor,netSalesMinor:row.netSalesMinor,gstMinor:row.gstMinor,
  discountMinor:row.discountMinor,cogsMinor:costVisible?row.cogsMinor:null,grossProfitMinor:costVisible?row.grossProfitMinor:null}));
 return {page,pageSize,hasMore:rows.length>page*pageSize,items};
}
const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const reportTitle=groupBy=>({medicine:'Sales by Medicine',generic:'Sales by Generic',category:'Sales by Category',brand:'Sales by Brand/Manufacturer',cashier:'Sales by Cashier',method:'Sales by Payment Method',tax:'Taxable vs Exempt Sales'})[groupBy];
const reportStem=groupBy=>reportTitle(groupBy).replaceAll(' ','_').replaceAll('/','_');
function medicineCsv(db,input,options={}){
 const summary=medicineSummary(db,input,options);
 const all=data(db,input,options),head=[summary.groupBy==='generic'?'Generic':summary.groupBy==='category'?'Category':summary.groupBy==='brand'?'Brand/Manufacturer':summary.groupBy==='cashier'?'Cashier':summary.groupBy==='method'?'Original payment method':summary.groupBy==='tax'?'Tax class':'Medicine',...(summary.groupBy==='medicine'?['Generic','Category','Brand']:[]),'Sold quantity','Returned quantity','Sales minor','Returns minor','Net sales minor','GST minor','Net ex-GST minor',...(summary.groupBy==='tax'?['Taxable base minor']:[]),'Discount minor',...(summary.costVisible?['COGS minor','Gross profit minor']:[])];
 const out=[[reportTitle(summary.groupBy)],['Range',summary.range.from,summary.range.to],['Day grouping',input.dayMode||'official'],['Scope',summary.scope],[],head,...summary.groups.map(g=>[g.groupLabel,...(summary.groupBy==='medicine'?[g.generic,g.category,g.brand]:[]),g.soldQuantity,g.returnedQuantity,g.salesMinor,g.returnsMinor,g.netSalesMinor,g.gstMinor,g.netExGstMinor,...(summary.groupBy==='tax'?[g.taxableBaseMinor]:[]),g.discountMinor,...(summary.costVisible?[g.cogsMinor,g.grossProfitMinor]:[])]),[],['Total net sales minor',summary.totals.netSalesMinor],['Total GST minor',summary.totals.gstMinor]];
 out.push([],['Date','Type','Reference','Medicine','Quantity','Net sales minor','GST minor',...(summary.costVisible?['COGS minor','Gross profit minor']:[])]);
 for(const r of all)out.push([r.day,r.kind,r.reference,r.productName,r.quantity,r.netSalesMinor,r.gstMinor,...(summary.costVisible?[r.cogsMinor,r.grossProfitMinor]:[])]);
 return {filename:`TechOrbit_${reportStem(summary.groupBy)}.csv`,csv:'\uFEFF'+out.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function medicineXlsx(db,input,options={}){
 const ExcelJS=require('exceljs'),summary=medicineSummary(db,input,options),all=data(db,input,options);
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(reportTitle(summary.groupBy).replaceAll('/','-'));
 sheet.addRow([`TechOrbit Pharmacy POS - ${reportTitle(summary.groupBy)}`]);
 sheet.addRow(['From',summary.range.from,'To',summary.range.to]);
 sheet.addRow(['Day grouping',input.dayMode||'official']);sheet.addRow(['Scope',summary.scope]);sheet.addRow([]);
 sheet.addRow([summary.groupBy==='generic'?'Generic':summary.groupBy==='category'?'Category':summary.groupBy==='brand'?'Brand/Manufacturer':summary.groupBy==='cashier'?'Cashier':summary.groupBy==='method'?'Original payment method':summary.groupBy==='tax'?'Tax class':'Medicine',...(summary.groupBy==='medicine'?['Generic','Category','Brand']:[]),'Sold quantity','Returned quantity','Sales PKR','Returns PKR','Net sales PKR','GST PKR','Net ex-GST PKR',...(summary.groupBy==='tax'?['Taxable base PKR']:[]),'Discount PKR',...(summary.costVisible?['COGS PKR','Gross profit PKR']:[])]);
 for(const g of summary.groups)sheet.addRow([g.groupLabel,...(summary.groupBy==='medicine'?[g.generic,g.category,g.brand]:[]),g.soldQuantity,g.returnedQuantity,g.salesMinor/100,g.returnsMinor/100,g.netSalesMinor/100,g.gstMinor/100,g.netExGstMinor/100,...(summary.groupBy==='tax'?[g.taxableBaseMinor/100]:[]),g.discountMinor/100,...(summary.costVisible?[g.cogsMinor/100,g.grossProfitMinor/100]:[])]);
 sheet.addRow([]);sheet.addRow(['Total net sales PKR',summary.totals.netSalesMinor/100]);sheet.addRow([]);
 sheet.addRow(['Day','Type','Reference','Medicine','Quantity','Net sales PKR','GST PKR',...(summary.costVisible?['COGS PKR','Gross profit PKR']:[])]);
 for(const r of all)sheet.addRow([r.day,r.kind,r.reference,r.productName,r.quantity,r.netSalesMinor/100,r.gstMinor/100,...(summary.costVisible?[r.cogsMinor/100,r.grossProfitMinor/100]:[])]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(6).font={bold:true};sheet.columns=Array.from({length:14},(_,i)=>({width:i<4?25:18}));
 return {filename:`TechOrbit_${reportStem(summary.groupBy)}.xlsx`,base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function medicinePdf(db,input,options={}){
 const {jsPDF}=require('jspdf'),summary=medicineSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line(`TechOrbit Pharmacy POS - ${reportTitle(summary.groupBy)}`);line('Net sales',`PKR ${(summary.totals.netSalesMinor/100).toFixed(2)}`);
 line(summary.groupBy==='generic'?'Generic':summary.groupBy==='category'?'Category':summary.groupBy==='brand'?'Brand/Manufacturer':summary.groupBy==='cashier'?'Cashier':summary.groupBy==='method'?'Original payment method':summary.groupBy==='tax'?'Tax class':'Medicine','Net sales PKR');for(const row of summary.groups)line(row.groupLabel,(row.netSalesMinor/100).toFixed(2));
 return {filename:`TechOrbit_${reportStem(summary.groupBy)}.pdf`,base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={medicineSummary,medicineEntries,medicineCsv,medicineXlsx,medicinePdf};
