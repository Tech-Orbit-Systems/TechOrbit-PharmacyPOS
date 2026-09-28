const {dayKey}=require('./ranges.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
function data(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid low stock filters');
 for(const key of ['q','generic','category','brand','supplier']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid low stock filters');
  if(String(input[key]||'').length>100)throw Error('Low stock filter is too long');
 }
 const status=input.status||'all';if(!['all','low','out'].includes(status))throw Error('Choose a valid low stock status');
 const asOfDate=dayKey(options.now||new Date()),clauses=['p.active=1'],args=[];
 if(input.q?.trim()){clauses.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')");args.push(like(input.q.trim()),like(input.q.trim()))}
 for(const [key,column] of [['generic','p.generic_name'],['category','p.category'],['brand','p.manufacturer'],['supplier','s.name']]){
  if(input[key]?.trim()){clauses.push(`${column} LIKE ? ESCAPE '\\'`);args.push(like(input[key].trim()))}
 }
 const rows=db.prepare(`SELECT p.id product_id,p.sku,p.name medicine,p.generic_name generic,p.category,p.manufacturer brand,p.base_unit,
   p.minimum_stock,p.reorder_level,s.name supplier,
   COALESCE(SUM(b.quantity_on_hand),0) physical_quantity,
   COALESCE(SUM(CASE WHEN b.expiry_date IS NULL OR b.expiry_date>? THEN b.quantity_on_hand ELSE 0 END),0) sellable_quantity,
   COALESCE(SUM(CASE WHEN b.expiry_date<=? THEN b.quantity_on_hand ELSE 0 END),0) expired_quantity,
   COUNT(b.id) batch_count
   FROM Products p LEFT JOIN ProductBatches b ON b.product_id=p.id LEFT JOIN Suppliers s ON s.id=p.default_supplier_id
   WHERE ${clauses.join(' AND ')} GROUP BY p.id ORDER BY p.name,p.id`).all(asOfDate,asOfDate,...args);
 if(rows.length>10000)throw Error('Low stock report exceeds 10,000 products; narrow the filters');
 const items=rows.map(row=>{
  const threshold=Number(row.reorder_level||row.minimum_stock||0),physicalQuantity=Number(row.physical_quantity),sellableQuantity=Number(row.sellable_quantity);
  const expiredQuantity=Number(row.expired_quantity),status=sellableQuantity<=0?'out':'low';
  return {productId:row.product_id,sku:row.sku||'',medicine:row.medicine,generic:row.generic||'',category:row.category||'',brand:row.brand||'',
   supplier:row.supplier||'',baseUnit:row.base_unit,minimumStock:Number(row.minimum_stock),reorderLevel:Number(row.reorder_level),
   threshold,physicalQuantity,sellableQuantity,expiredQuantity,batchCount:row.batch_count,status,
   unitsToClearAlert:Math.max(1,Math.ceil(threshold+1-sellableQuantity))};
 }).filter(row=>row.sellableQuantity<=row.threshold&&(status==='all'||row.status===status));
 return {asOfDate,items};
}
function lowStockSummary(db,input={},options={}){
 const {asOfDate,items}=data(db,input,options);
 const totals={productCount:items.length,outCount:items.filter(row=>row.status==='out').length,lowCount:items.filter(row=>row.status==='low').length,
  physicalQuantity:items.reduce((sum,row)=>sum+row.physicalQuantity,0),sellableQuantity:items.reduce((sum,row)=>sum+row.sellableQuantity,0),
  expiredQuantity:items.reduce((sum,row)=>sum+row.expiredQuantity,0),unitsToClearAlert:items.reduce((sum,row)=>sum+row.unitsToClearAlert,0)};
 return {asOfDate,items,totals,scope:'Live snapshot for active products. Sellable excludes expired batches; physical includes them. A configured reorder level takes priority when positive, otherwise minimum stock applies. One unit above the threshold clears the alert. This report has no historical stock claim.'};
}
function lowStockEntries(db,input={},options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function lowStockCsv(db,input={},options={}){
 const report=lowStockSummary(db,input,options),rows=[['Low Stock Report'],['As of',report.asOfDate],['Scope',report.scope],[],
 ['Medicine','SKU','Generic','Category','Brand','Default supplier','Base unit','Physical units','Sellable units','Expired units','Minimum stock','Reorder level','Applied threshold','Status','Units to clear alert'],
 ...report.items.map(r=>[r.medicine,r.sku,r.generic,r.category,r.brand,r.supplier,r.baseUnit,r.physicalQuantity,r.sellableQuantity,r.expiredQuantity,r.minimumStock,r.reorderLevel,r.threshold,r.status,r.unitsToClearAlert]),[],
 ['Low stock products',report.totals.lowCount],['Out of stock products',report.totals.outCount],['Total units to clear alerts',report.totals.unitsToClearAlert]];
 return {filename:'TechOrbit_Low_Stock_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function lowStockXlsx(db,input={},options={}){
 const ExcelJS=require('exceljs'),report=lowStockSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Low Stock');
 sheet.addRow(['TechOrbit Pharmacy POS - Low Stock Report']);sheet.addRow(['As of',report.asOfDate]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 sheet.addRow(['Medicine','SKU','Generic','Category','Brand','Default supplier','Base unit','Physical units','Sellable units','Expired units','Minimum stock','Reorder level','Threshold','Status','Units to clear alert']);
 for(const r of report.items)sheet.addRow([r.medicine,r.sku,r.generic,r.category,r.brand,r.supplier,r.baseUnit,r.physicalQuantity,r.sellableQuantity,r.expiredQuantity,r.minimumStock,r.reorderLevel,r.threshold,r.status,r.unitsToClearAlert]);
 sheet.addRow([]);sheet.addRow(['Low stock products',report.totals.lowCount]);sheet.addRow(['Out of stock products',report.totals.outCount]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:15},(_,i)=>({width:i<6?22:18}));
 return {filename:'TechOrbit_Low_Stock_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function lowStockPdf(db,input={},options={}){
 const {jsPDF}=require('jspdf'),report=lowStockSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Low Stock Report');line(`As of ${report.asOfDate}`);line('Low products',report.totals.lowCount);line('Out products',report.totals.outCount);
 line('Medicine / status','Sellable / threshold');for(const row of report.items)line(`${row.medicine} / ${row.status}`,`${row.sellableQuantity} / ${row.threshold}`);
 return {filename:'TechOrbit_Low_Stock_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={lowStockSummary,lowStockEntries,lowStockCsv,lowStockXlsx,lowStockPdf};
