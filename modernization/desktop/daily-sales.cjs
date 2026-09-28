const {reportRange}=require('./reports.cjs');

const METHODS=new Set(['cash','card','digital','credit']);
const FIELDS=['salesMinor','returnsMinor','netSalesMinor','gstMinor','netExGstMinor','discountMinor','cogsMinor','grossProfitMinor','paidAtSaleMinor','creditCreatedMinor','refundMinor','receivableCreditMinor','saleCount','returnCount'];
const empty=()=>Object.fromEntries(FIELDS.map(key=>[key,0]));
const like=value=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
function groupDays(rows,period,costVisible){
  if(period==='day')return rows.map(row=>present(row,costVisible));
  const grouped=new Map();
  for(const row of rows){
    const date=new Date(`${row.day}T00:00:00Z`);
    const offset=(date.getUTCDay()+6)%7;
    date.setUTCDate(date.getUTCDate()-offset);
    const day=date.toISOString().slice(0,10);
    const current=grouped.get(day)||{day,...empty()};
    for(const field of FIELDS)if(field in row)current[field]+=row[field];
    grouped.set(day,current);
  }
  return [...grouped.values()].sort((a,b)=>b.day.localeCompare(a.day)).map(row=>present(row,costVisible));
}

function base(input,now=new Date()) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid report filters');
  const range=reportRange(input,now),clauses=[],args=[];
  const dayMode=input.dayMode||'official';
  if(!['official','calendar'].includes(dayMode))throw Error('Choose a valid day grouping');
  const dayFor=column=>dayMode==='official'
    ? `COALESCE((SELECT strftime('%Y-%m-%d',bd.opened_at,'+5 hours') FROM BusinessDays bd
       WHERE julianday(${column})>=julianday(bd.opened_at)
         AND (bd.closed_at IS NULL OR julianday(${column})<julianday(bd.closed_at))
       ORDER BY julianday(bd.opened_at) DESC LIMIT 1),strftime('%Y-%m-%d',${column},'+5 hours'))`
    : `strftime('%Y-%m-%d',${column},'+5 hours')`;
  for(const key of ['product','category','brand','supplier','customer','cashier']){
    if(input[key]!=null && typeof input[key]!=='string')throw Error('Choose valid report filters');
    if(String(input[key]||'').length>100)throw Error('Report filter is too long');
  }
  const item=[];
  if(input.product?.trim()){
    item.push("(si.product_name_snapshot LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')");
    args.push(like(input.product.trim()),like(input.product.trim()));
  }
  if(input.category?.trim()){item.push("p.category LIKE ? ESCAPE '\\'");args.push(like(input.category.trim()))}
  if(input.brand?.trim()){item.push("p.manufacturer LIKE ? ESCAPE '\\'");args.push(like(input.brand.trim()))}
  if(input.supplier?.trim()){item.push("sup.name LIKE ? ESCAPE '\\'");args.push(like(input.supplier.trim()))}
  if(item.length)clauses.push(`EXISTS (SELECT 1 FROM SaleItems si JOIN Products p ON p.id=si.product_id
    LEFT JOIN SaleItemAllocations a ON a.sale_item_id=si.id LEFT JOIN ProductBatches b ON b.id=a.batch_id
    LEFT JOIN Suppliers sup ON sup.id=b.supplier_id WHERE si.sale_id=s.id AND ${item.join(' AND ')})`);
  if(input.customer?.trim()){
    clauses.push("(s.customer_name_snapshot LIKE ? ESCAPE '\\' OR s.customer_phone_snapshot LIKE ? ESCAPE '\\')");
    args.push(like(input.customer.trim()),like(input.customer.trim()));
  }
  if(input.cashier?.trim()){
    clauses.push("u.display_name LIKE ? ESCAPE '\\'");args.push(like(input.cashier.trim()));
  }
  if(input.method){if(!METHODS.has(input.method))throw Error('Choose a valid payment method');clauses.push('s.payment_method=?');args.push(input.method)}
  const filters=clauses.length?' AND '+clauses.join(' AND '):'';
  const common=`LEFT JOIN Users u ON u.id=s.created_by`;
  const sale=`SELECT 'sale' kind,s.id,s.sold_at occurred_at,${dayFor('s.sold_at')} day,
    s.invoice_number reference,s.customer_name_snapshot customer,u.display_name cashier,s.payment_method method,
    s.final_total_minor salesMinor,0 returnsMinor,s.gst_minor gstMinor,
    s.line_discount_minor+s.invoice_discount_minor discountMinor,s.cogs_minor cogsMinor,
    s.amount_paid_minor-COALESCE((SELECT SUM(rp.amount_minor) FROM ReceivablePayments rp WHERE rp.sale_id=s.id),0) paidAtSaleMinor,
    s.final_total_minor-s.amount_paid_minor+COALESCE((SELECT SUM(rp.amount_minor) FROM ReceivablePayments rp WHERE rp.sale_id=s.id),0) creditCreatedMinor,
    0 refundMinor,0 receivableCreditMinor,1 saleCount,0 returnCount
    FROM Sales s ${common} WHERE s.status='posted'${dayMode==='calendar'?' AND julianday(s.sold_at)>=julianday(?) AND julianday(s.sold_at)<julianday(?)':''}${filters}`;
  const returned=`SELECT 'return' kind,r.id,r.returned_at occurred_at,${dayFor('r.returned_at')} day,
    s.invoice_number||' / Return '||r.id reference,s.customer_name_snapshot customer,u.display_name cashier,s.payment_method method,
    0 salesMinor,r.total_minor returnsMinor,
    -COALESCE((SELECT SUM(i.gst_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id),0) gstMinor,
    0 discountMinor,-COALESCE((SELECT SUM(i.cogs_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id),0) cogsMinor,
    0 paidAtSaleMinor,0 creditCreatedMinor,r.refund_minor refundMinor,r.receivable_credit_minor receivableCreditMinor,
    0 saleCount,1 returnCount FROM SaleReturns r JOIN Sales s ON s.id=r.sale_id ${common}
    WHERE 1=1${dayMode==='calendar'?' AND julianday(r.returned_at)>=julianday(?) AND julianday(r.returned_at)<julianday(?)':''}${filters}`;
  const sql=`WITH raw AS (${sale} UNION ALL ${returned}),entries AS (SELECT * FROM raw WHERE day>=? AND day<=?)`;
  const params=[...(dayMode==='calendar'?[range.start,range.end]:[]),...args,
    ...(dayMode==='calendar'?[range.start,range.end]:[]),...args,range.from,range.to];
  return {range,sql,params,dayMode};
}

function present(raw,costVisible){
  const netSalesMinor=raw.salesMinor-raw.returnsMinor;
  const netExGstMinor=netSalesMinor-raw.gstMinor;
  return {...raw,netSalesMinor,netExGstMinor,
    cogsMinor:costVisible?raw.cogsMinor:null,
    grossProfitMinor:costVisible?netExGstMinor-raw.cogsMinor:null};
}

function dailySalesSummary(db,input,options={}) {
  const {range,sql,params,dayMode}=base(input,options.now);
  const period=input.period||'day';
  if(!['day','week'].includes(period))throw Error('Choose a valid sales period');
  const rows=db.prepare(`${sql} SELECT day,
    SUM(salesMinor) salesMinor,SUM(returnsMinor) returnsMinor,SUM(gstMinor) gstMinor,
    SUM(discountMinor) discountMinor,SUM(cogsMinor) cogsMinor,
    SUM(paidAtSaleMinor) paidAtSaleMinor,SUM(creditCreatedMinor) creditCreatedMinor,
    SUM(refundMinor) refundMinor,SUM(receivableCreditMinor) receivableCreditMinor,
    SUM(saleCount) saleCount,SUM(returnCount) returnCount
    FROM entries GROUP BY day ORDER BY day DESC`).all(...params);
  const totals=empty();for(const row of rows)for(const key of FIELDS)if(key in row)totals[key]+=row[key];
  totals.netSalesMinor=totals.salesMinor-totals.returnsMinor;
  totals.netExGstMinor=totals.netSalesMinor-totals.gstMinor;
  totals.grossProfitMinor=totals.netExGstMinor-totals.cogsMinor;
  return {range:{from:range.from,to:range.to},dayMode,period,days:groupDays(rows,period,options.costVisible),
    totals:present(totals,options.costVisible),costVisible:Boolean(options.costVisible),
    filterScope:'Filters select whole invoices and related returns. Category and brand use current product metadata. Official day uses its opening date; unmatched historical events fall back to Pakistan calendar date.'};
}

function dailySalesEntries(db,input,options={}) {
  const {range,sql,params,dayMode}=base(input,options.now);
  const page=Number(input.page||1),pageSize=Number(input.pageSize||25);
  if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
  const rows=db.prepare(`${sql} SELECT * FROM entries ORDER BY julianday(occurred_at) DESC,kind,id DESC LIMIT ? OFFSET ?`)
    .all(...params,pageSize+1,(page-1)*pageSize);
  return {range:{from:range.from,to:range.to},dayMode,page,pageSize,hasMore:rows.length>pageSize,
    items:rows.slice(0,pageSize).map(row=>present(row,options.costVisible))};
}

function allEntries(db,input,options){
  const items=[];let page=1,result;
  do{result=dailySalesEntries(db,{...input,page,pageSize:100},options);items.push(...result.items);page++;
    if(items.length>10000)throw Error('Report export exceeds 10,000 entries; narrow the dates or filters');
  }while(result.hasMore);
  return items;
}
function columns(costVisible){return ['Day','Type','Reference','Customer','Cashier','Payment method','Sales minor','Returns minor','Net sales minor','GST minor','Net ex-GST minor','Discount minor','Paid at sale minor','Credit created minor','Refund minor','Receivable credit minor',...(costVisible?['COGS minor','Gross profit minor']:[])];}
function values(row,costVisible){return [row.day,row.kind,row.reference,row.customer||'',row.cashier||'',row.method,row.salesMinor,row.returnsMinor,row.netSalesMinor,row.gstMinor,row.netExGstMinor,row.discountMinor,row.paidAtSaleMinor,row.creditCreatedMinor,row.refundMinor,row.receivableCreditMinor,...(costVisible?[row.cogsMinor,row.grossProfitMinor]:[])];}
function filterRows(input){return [['Period',input.period||'day'],['Day grouping',input.dayMode||'official'],['Product',input.product],['Category',input.category],['Brand',input.brand],['Recorded batch supplier',input.supplier],['Customer',input.customer],['Cashier',input.cashier],['Payment method',input.method]].filter(([,value])=>String(value||'').trim()).map(([key,value])=>[`${key} filter`,String(value).trim()]);}
function periodRows(summary){return summary.period==='week'?[['Week starting Monday','Sales minor','Returns minor','Net sales minor','GST minor','Net ex-GST minor',...(summary.costVisible?['COGS minor','Gross profit minor']:[])],...summary.days.map(row=>[row.day,row.salesMinor,row.returnsMinor,row.netSalesMinor,row.gstMinor,row.netExGstMinor,...(summary.costVisible?[row.cogsMinor,row.grossProfitMinor]:[])])]:[]}
const reportTitle=summary=>summary.period==='week'?'Weekly Sales':'Daily Sales';
const reportStem=summary=>summary.period==='week'?'Weekly_Sales':'Daily_Sales';
const quoted=x=>'"'+String(x??'').replaceAll('"','""')+'"';
function dailySalesCsv(db,input,options={}){
  const summary=dailySalesSummary(db,input,options),items=allEntries(db,input,options);
  const lines=[[reportTitle(summary),summary.range.from,summary.range.to],...filterRows(input),['Filter scope',summary.filterScope],[],
    ...periodRows(summary),...(summary.period==='week'?[[]]:[]),
    columns(summary.costVisible),...items.map(row=>values(row,summary.costVisible)),[],
    ['Total sales minor',summary.totals.salesMinor],['Total returns minor',summary.totals.returnsMinor],
    ['Net sales minor',summary.totals.netSalesMinor],['Net GST minor',summary.totals.gstMinor],
    ['Net ex-GST minor',summary.totals.netExGstMinor],['Discount minor',summary.totals.discountMinor],
    ...(summary.costVisible?[['Net COGS minor',summary.totals.cogsMinor],['Gross profit minor',summary.totals.grossProfitMinor]]:[])];
  return {filename:`TechOrbit_${reportStem(summary)}_${summary.range.from}_${summary.range.to}.csv`,csv:'\uFEFF'+lines.map(row=>row.map(quoted).join(',')).join('\r\n')+'\r\n'};
}
async function dailySalesXlsx(db,input,options={}){
  const ExcelJS=require('exceljs'),summary=dailySalesSummary(db,input,options),items=allEntries(db,input,options);
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(reportTitle(summary));
  sheet.addRow([`TechOrbit Pharmacy POS - ${reportTitle(summary)}`]);sheet.addRow(['From',summary.range.from,'To',summary.range.to]);
  sheet.addRow(['Net sales PKR',summary.totals.netSalesMinor/100,'Net ex-GST PKR',summary.totals.netExGstMinor/100]);
  if(summary.costVisible)sheet.addRow(['Gross profit PKR',summary.totals.grossProfitMinor/100]);
  for(const row of filterRows(input))sheet.addRow(row);
  sheet.addRow(['Filter scope',summary.filterScope]);sheet.addRow([]);
  for(const row of periodRows(summary))sheet.addRow(row.map((value,index)=>index>0&&typeof value==='number'?value/100:value));
  if(summary.period==='week')sheet.addRow([]);
  const header=sheet.rowCount+1;sheet.addRow(columns(summary.costVisible).map(x=>x.replace(' minor',' PKR')));
  for(const row of items)sheet.addRow(values(row,summary.costVisible).map((value,index)=>index>=6?value/100:value));
  sheet.getRow(1).font={bold:true,size:14};sheet.getRow(header).font={bold:true};
  sheet.columns=columns(summary.costVisible).map((_,i)=>({width:i===2?26:i<6?20:18}));
  for(let row=header+1;row<=sheet.rowCount;row++)for(let col=7;col<=columns(summary.costVisible).length;col++)sheet.getCell(row,col).numFmt='#,##0.00;[Red](#,##0.00)';
  const buffer=Buffer.from(await book.xlsx.writeBuffer());
  return {filename:`TechOrbit_${reportStem(summary)}_${summary.range.from}_${summary.range.to}.xlsx`,base64:buffer.toString('base64')};
}
function dailySalesPdf(db,input,options={}){
  const {jsPDF}=require('jspdf'),summary=dailySalesSummary(db,input,options),items=allEntries(db,input,options);
  const doc=new jsPDF({unit:'pt',format:'a4'}),max=doc.internal.pageSize.height;
  let y=42;const line=(left,right='',bold=false)=>{if(y>max-42){doc.addPage();y=42}doc.setFont('helvetica',bold?'bold':'normal');doc.text(String(left).slice(0,70),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
  line(`TechOrbit Pharmacy POS - ${reportTitle(summary)}`,'',true);line(`${summary.range.from} to ${summary.range.to}`);
  line('Net sales',`PKR ${(summary.totals.netSalesMinor/100).toFixed(2)}`);
  line('Net ex-GST',`PKR ${(summary.totals.netExGstMinor/100).toFixed(2)}`);
  if(summary.costVisible)line('Gross profit',`PKR ${(summary.totals.grossProfitMinor/100).toFixed(2)}`);
  for(const [key,value] of filterRows(input))line(`${key}: ${value}`);
  line('Invoice-level filters; official closing day is separate.');
  if(summary.period==='week'){y+=10;line('Week of','Net sales PKR',true);for(const row of summary.days)line(row.day,(row.netSalesMinor/100).toFixed(2));}
  y+=12;line('Day / Type / Reference','Net sales PKR',true);
  for(const row of items)line(`${row.day} / ${row.kind} / ${row.reference}`,`${(row.netSalesMinor/100).toFixed(2)}`);
  return {filename:`TechOrbit_${reportStem(summary)}_${summary.range.from}_${summary.range.to}.pdf`,base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={dailySalesSummary,dailySalesEntries,dailySalesCsv,dailySalesXlsx,dailySalesPdf};
