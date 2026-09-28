const {batchStockSummary}=require('./batch-stock-report.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
function stockValuationSummary(db,input={},options={}){
 const source=batchStockSummary(db,input,{...options,costVisible:true});
 const items=source.items.map(row=>{
  const cost=db.prepare('SELECT unit_cost_minor FROM ProductBatches WHERE id=?').get(row.id).unit_cost_minor;
  const physicalValueMinor=Math.round(row.physicalQuantity*cost),sellableValueMinor=Math.round(row.sellableQuantity*cost);
  return {...row,batchCostMinor:cost,physicalValueMinor,sellableValueMinor,blockedValueMinor:physicalValueMinor-sellableValueMinor};
 });
 const groups=new Map();
 for(const row of items){let group=groups.get(row.productId);
  if(!group){group={productId:row.productId,name:row.name,sku:row.sku,batchCount:0,physicalQuantity:0,sellableQuantity:0,physicalValueMinor:0,sellableValueMinor:0,blockedValueMinor:0};groups.set(row.productId,group)}
  group.batchCount++;for(const field of ['physicalQuantity','sellableQuantity','physicalValueMinor','sellableValueMinor','blockedValueMinor'])group[field]+=row[field];
 }
 const products=[...groups.values()],totals={batchCount:items.length,physicalQuantity:0,sellableQuantity:0,physicalValueMinor:0,sellableValueMinor:0,blockedValueMinor:0};
 for(const row of products)for(const field of ['physicalQuantity','sellableQuantity','physicalValueMinor','sellableValueMinor','blockedValueMinor'])totals[field]+=row[field];
 if(totals.physicalValueMinor!==totals.sellableValueMinor+totals.blockedValueMinor)throw Error('Stock valuation totals do not reconcile');
 return {asOfDate:source.asOfDate,items,products,totals,scope:'Current batch carrying-cost snapshot: physical quantity multiplied by saved ProductBatches.unit_cost_minor, rounded per batch. That saved cost is weighted by purchase receiving and used by sales allocation. Sellable excludes expired/inactive stock; blocked value is physical less sellable. This differs from the latest-receipt effective-cost estimate shown by live inventory. No historical reconstruction or automatic write-down is performed.'};
}
function stockValuationEntries(db,input={},options={}){
 const {items}=stockValuationSummary(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function stockValuationCsv(db,input={},options={}){
 const r=stockValuationSummary(db,input,options),rows=[['Stock Valuation Report'],['As of',r.asOfDate],['Basis',r.scope],[],
 ['Product','SKU','Batch','Supplier','Expiry','Physical units','Sellable units','Saved batch cost minor','Physical value minor','Sellable value minor','Blocked value minor'],
 ...r.items.map(x=>[x.name,x.sku,x.batchNumber,x.supplierName,x.expiryDate,x.physicalQuantity,x.sellableQuantity,x.batchCostMinor,x.physicalValueMinor,x.sellableValueMinor,x.blockedValueMinor]),[],
 ['Total physical value minor',r.totals.physicalValueMinor],['Total sellable value minor',r.totals.sellableValueMinor],['Total blocked value minor',r.totals.blockedValueMinor]];
 return {filename:'TechOrbit_Stock_Valuation_Report.csv',csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function stockValuationXlsx(db,input={},options={}){
 const ExcelJS=require('exceljs'),r=stockValuationSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Stock Valuation');
 sheet.addRow(['Stock Valuation Report']);sheet.addRow(['As of',r.asOfDate]);sheet.addRow(['Basis',r.scope]);sheet.addRow([]);
 sheet.addRow(['Product','SKU','Batch','Supplier','Expiry','Physical units','Sellable units','Batch cost PKR','Physical value PKR','Sellable value PKR','Blocked value PKR']);
 for(const x of r.items)sheet.addRow([x.name,x.sku,x.batchNumber,x.supplierName,x.expiryDate,x.physicalQuantity,x.sellableQuantity,x.batchCostMinor/100,x.physicalValueMinor/100,x.sellableValueMinor/100,x.blockedValueMinor/100]);
 sheet.addRow(['Total physical value PKR',r.totals.physicalValueMinor/100]);sheet.addRow(['Total sellable value PKR',r.totals.sellableValueMinor/100]);sheet.addRow(['Total blocked value PKR',r.totals.blockedValueMinor/100]);
 sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:11},()=>({width:22}));
 return {filename:'TechOrbit_Stock_Valuation_Report.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function stockValuationPdf(db,input={},options={}){
 const {jsPDF}=require('jspdf'),r=stockValuationSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});let y=42;
 const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line('Stock Valuation Report');line(`As of ${r.asOfDate}`);line('Basis: saved weighted batch cost');
 for(const [name,key] of [['Physical value','physicalValueMinor'],['Sellable value','sellableValueMinor'],['Blocked value','blockedValueMinor']])line(name,`PKR ${(r.totals[key]/100).toFixed(2)}`);
 for(const x of r.items)line(`${x.name} / ${x.batchNumber||'none'}`,`PKR ${(x.physicalValueMinor/100).toFixed(2)}`);
 return {filename:'TechOrbit_Stock_Valuation_Report.pdf',base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={stockValuationSummary,stockValuationEntries,stockValuationCsv,stockValuationXlsx,stockValuationPdf};
