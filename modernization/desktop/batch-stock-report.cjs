const {dayKey}=require('./ranges.cjs');
const {InventoryLiveStockService}=require('../../infrastructure/sqlite/services/inventory-live-stock');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const match=(value,filter)=>String(value||'').toLocaleLowerCase().includes(filter.toLocaleLowerCase());
function data(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid batch stock filters');
 for(const key of ['q','generic','category','brand','supplier','batch']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid batch stock filters');
  if(String(input[key]||'').length>100)throw Error('Batch stock filter is too long');
 }
 const status=input.status||'all';
 if(!['all','in','low','out','expired','near'].includes(status))throw Error('Choose a valid batch stock status');
 const asOfDate=dayKey(options.now||new Date()),costVisible=Boolean(options.costVisible),service=new InventoryLiveStockService(db);
 const rows=db.prepare(`SELECT b.id,b.product_id,b.supplier_id,b.batch_number,b.manufacturing_date,b.expiry_date,
  b.opening_quantity,b.purchased_quantity,b.bonus_quantity,b.disposed_quantity,b.quantity_on_hand,b.unit_cost_minor,b.sale_price_minor,b.received_at,
  p.sku,p.category,p.name,p.generic_name,p.manufacturer,p.minimum_stock,p.reorder_level,p.base_unit,p.active,s.name supplier_name,
  COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) effective_cost_minor,
  COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale'),0) sold_quantity,
  COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale_return'),0) customer_return_quantity,
  COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='purchase_return'),0) supplier_return_quantity,
  COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='adjustment'),0) adjustment_quantity
  FROM ProductBatches b JOIN Products p ON p.id=b.product_id LEFT JOIN Suppliers s ON s.id=b.supplier_id
  ORDER BY p.name,b.expiry_date,b.id`).all();
 if(rows.length>10000)throw Error('Batch stock report exceeds 10,000 batches; narrow the source data');
 const items=rows.map(row=>{
  const stock=service.present(row,asOfDate,costVisible);
  return {...stock,sku:row.sku||'',category:row.category||'',active:Boolean(row.active)};
 }).filter(row=>{
  if(input.activeOnly&& !row.active)return false;
  for(const [key,value] of [['generic',row.genericName],['category',row.category],['brand',row.manufacturer],['supplier',row.supplierName],['batch',row.batchNumber]])
   if(input[key]?.trim()&&!match(value,input[key].trim()))return false;
  if(input.q?.trim()&&![row.name,row.sku,row.batchNumber].some(value=>match(value,input.q.trim())))return false;
  const mapped=row.stockStatus==='IN STOCK'?'in':row.stockStatus==='LOW STOCK'?'low':row.stockStatus==='OUT OF STOCK'?'out':row.stockStatus==='EXPIRED'?'expired':'near';
  return status==='all'||mapped===status;
 });
 return {asOfDate,costVisible,items};
}
function batchStockSummary(db,input={},options={}){
 const {asOfDate,costVisible,items}=data(db,input,options),sum=field=>items.reduce((total,row)=>total+row[field],0);
 const totals={batchCount:items.length,physicalQuantity:sum('physicalQuantity'),sellableQuantity:sum('sellableQuantity'),
  zeroStockBatches:items.filter(row=>row.physicalQuantity===0).length,expiredBatches:items.filter(row=>row.expiryStatus==='EXPIRED').length,
  stockValueMinor:costVisible?sum('stockValueMinor'):null};
 const groups=new Map();for(const row of items){let group=groups.get(row.productId);
  if(!group){group={productId:row.productId,name:row.name,sku:row.sku,batchCount:0,physicalQuantity:0,sellableQuantity:0,stockValueMinor:costVisible?0:null};groups.set(row.productId,group)}
  group.batchCount++;group.physicalQuantity+=row.physicalQuantity;group.sellableQuantity+=row.sellableQuantity;
  if(costVisible)group.stockValueMinor+=row.stockValueMinor;
 }
 const products=[...groups.values()];
 if(products.reduce((total,row)=>total+row.physicalQuantity,0)!==totals.physicalQuantity)throw Error('Batch stock groups do not reconcile');
 return {asOfDate,costVisible,items,products,totals,scope:'Live batch snapshot including zero-stock and inactive-product batches for traceability. Physical stock includes expired stock; sellable excludes expired or inactive stock. Cost and estimated physical stock value follow the existing live inventory convention and require report.cost. This is not a historical stock ledger.'};
}
function batchStockEntries(db,input={},options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function batchStockCsv(db,input={},options={}){
 const report=batchStockSummary(db,input,options),headers=['Product','SKU','Batch','Supplier','Expiry','Stock status','Physical units','Sellable units','Opening units','Purchased units','Bonus units','Sold units','Customer return units','Supplier return units','Adjustment units','Disposed units'];
 if(report.costVisible)headers.push('Effective cost minor','Stock value minor');
 const rows=[['Batch Stock Report'],['As of',report.asOfDate],['Scope',report.scope],[],headers,
 ...report.items.map(r=>{const row=[r.name,r.sku,r.batchNumber,r.supplierName,r.expiryDate,r.stockStatus,r.physicalQuantity,r.sellableQuantity,r.openingQuantity,r.purchasedQuantity,r.bonusQuantity,r.soldQuantity,r.customerReturnQuantity,r.supplierReturnQuantity,r.adjustmentQuantity,r.disposedQuantity];if(report.costVisible)row.push(r.effectiveCostMinor,r.stockValueMinor);return row}),[],
 ['Total physical units',report.totals.physicalQuantity],['Total sellable units',report.totals.sellableQuantity],['Zero-stock batches',report.totals.zeroStockBatches]];
 if(report.costVisible)rows.push(['Total stock value minor',report.totals.stockValueMinor]);
 return {filename:'TechOrbit_Batch_Stock_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function batchStockXlsx(db,input={},options={}){
 const ExcelJS=require('exceljs'),report=batchStockSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Batch Stock');
 sheet.addRow(['TechOrbit Pharmacy POS - Batch Stock Report']);sheet.addRow(['As of',report.asOfDate]);sheet.addRow(['Scope',report.scope]);sheet.addRow([]);
 const headers=['Product','SKU','Batch','Supplier','Expiry','Status','Physical','Sellable','Opening','Purchased','Bonus','Sold','Customer returns','Supplier returns','Adjustments','Disposed'];
 if(report.costVisible)headers.push('Effective cost PKR','Value PKR');sheet.addRow(headers);
 for(const r of report.items){const row=[r.name,r.sku,r.batchNumber,r.supplierName,r.expiryDate,r.stockStatus,r.physicalQuantity,r.sellableQuantity,r.openingQuantity,r.purchasedQuantity,r.bonusQuantity,r.soldQuantity,r.customerReturnQuantity,r.supplierReturnQuantity,r.adjustmentQuantity,r.disposedQuantity];if(report.costVisible)row.push(r.effectiveCostMinor/100,r.stockValueMinor/100);sheet.addRow(row)}
 sheet.addRow([]);sheet.addRow(['Total physical',report.totals.physicalQuantity]);sheet.addRow(['Total sellable',report.totals.sellableQuantity]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:headers.length},(_,i)=>({width:i<6?22:18}));
 return {filename:'TechOrbit_Batch_Stock_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function batchStockPdf(db,input={},options={}){
 const {jsPDF}=require('jspdf'),report=batchStockSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});
 let y=42;const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('TechOrbit Pharmacy POS - Batch Stock Report');line(`As of ${report.asOfDate}`);line('Physical units',report.totals.physicalQuantity);line('Sellable units',report.totals.sellableQuantity);
 if(report.costVisible)line('Estimated stock value',`PKR ${(report.totals.stockValueMinor/100).toFixed(2)}`);
 line('Product / batch / status','Physical / sellable');for(const row of report.items)line(`${row.name} / ${row.batchNumber||'none'} / ${row.stockStatus}`,`${row.physicalQuantity} / ${row.sellableQuantity}`);
 return {filename:'TechOrbit_Batch_Stock_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={batchStockSummary,batchStockEntries,batchStockCsv,batchStockXlsx,batchStockPdf};
