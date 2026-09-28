const {rangeFor}=require('./ranges.cjs');

function reportRange(input,now=new Date()) {
  const range=rangeFor(input,now);
  return {...range,asOf:now.toISOString()};
}

function profitLoss(db,input,now=new Date()) {
  const range=reportRange(input,now);
  const sale=db.prepare(`SELECT COALESCE(SUM(final_total_minor),0) gross,
    COALESCE(SUM(gross_minor),0) listedGross,
    COALESCE(SUM(gst_minor),0) gst,COALESCE(SUM(cogs_minor),0) cogs,
    COALESCE(SUM(line_discount_minor+invoice_discount_minor),0) discounts,
    COALESCE(SUM(rounding_minor),0) rounding,COUNT(*) count
    FROM Sales WHERE status='posted' AND julianday(sold_at)>=julianday(?) AND julianday(sold_at)<julianday(?)`).get(range.start,range.end);
  const returned=db.prepare(`SELECT COALESCE(SUM(r.total_minor),0) gross,
    COALESCE(SUM((SELECT SUM(i.gst_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id)),0) gst,
    COALESCE(SUM((SELECT SUM(i.cogs_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id)),0) cogs,
    COUNT(*) count FROM SaleReturns r
    WHERE julianday(r.returned_at)>=julianday(?) AND julianday(r.returned_at)<julianday(?)`).get(range.start,range.end);
  const expenses=db.prepare(`SELECT COALESCE(SUM(amount_minor),0) total,COUNT(*) count FROM Expenses
    WHERE status='posted' AND julianday(expense_date)>=julianday(?) AND julianday(expense_date)<julianday(?)`).get(range.start,range.end);
  const netRevenueMinor=sale.gross-sale.gst-returned.gross+returned.gst;
  const cogsMinor=sale.cogs-returned.cogs;
  const grossProfitMinor=netRevenueMinor-cogsMinor;
  return {range:{from:range.from,to:range.to,start:range.start,end:range.end,asOf:range.asOf},
    salesGrossMinor:sale.gross,listedGrossMinor:sale.listedGross,salesGstMinor:sale.gst,salesExGstMinor:sale.gross-sale.gst,
    salesDiscountMinor:sale.discounts,salesRoundingMinor:sale.rounding,saleCount:sale.count,
    returnsGrossMinor:returned.gross,returnsGstMinor:returned.gst,returnsExGstMinor:returned.gross-returned.gst,
    returnedCogsMinor:returned.cogs,returnCount:returned.count,netRevenueMinor,
    soldCogsMinor:sale.cogs,cogsMinor,grossProfitMinor,expensesMinor:expenses.total,
    expenseCount:expenses.count,operatingProfitMinor:grossProfitMinor-expenses.total};
}

function reportEntries(db,input,now=new Date()) {
  const range=reportRange(input,now);
  const page=Number(input.page||1),pageSize=Number(input.pageSize||25);
  if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
  const rows=db.prepare(`SELECT * FROM (
    SELECT 'sale' kind,id,sold_at occurred_at,invoice_number reference,final_total_minor gross_minor,gst_minor,
      cogs_minor,final_total_minor-gst_minor-cogs_minor contribution_minor FROM Sales WHERE status='posted'
    UNION ALL SELECT 'return',r.id,r.returned_at,'Return '||r.id,-r.total_minor,
      -COALESCE((SELECT SUM(i.gst_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id),0),
      -COALESCE((SELECT SUM(i.cogs_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id),0),
      -r.total_minor+COALESCE((SELECT SUM(i.gst_minor+i.cogs_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id),0)
      FROM SaleReturns r
    UNION ALL SELECT 'expense',id,expense_date,'Expense '||id,0,0,0,-amount_minor FROM Expenses WHERE status='posted'
  ) WHERE julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)
  ORDER BY julianday(occurred_at) DESC,kind,id DESC LIMIT ? OFFSET ?`)
    .all(range.start,range.end,pageSize+1,(page-1)*pageSize);
  return {range:{from:range.from,to:range.to},page,pageSize,hasMore:rows.length>pageSize,items:rows.slice(0,pageSize)};
}

function allEntries(db,input,now) {
  const items=[];
  let page=1,result;
  do {
    result=reportEntries(db,{...input,page,pageSize:100},now);
    items.push(...result.items);
    page++;
    if(page>10000)throw Error('Report is too large to export');
  } while(result.hasMore);
  return items;
}

function reportCsv(db,input,now=new Date()) {
  const summary=profitLoss(db,input,now),items=allEntries(db,input,now);
  const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  const lines=[['Type','Date/time','Reference','Gross minor','GST minor','COGS minor','P&L contribution minor'],
    ...items.map(x=>[x.kind,x.occurred_at,x.reference,x.gross_minor,x.gst_minor,x.cogs_minor,x.contribution_minor]),
    [],['Net ex-GST revenue minor',summary.netRevenueMinor],['COGS minor',summary.cogsMinor],
    ['Gross profit minor',summary.grossProfitMinor],['Incurred expenses minor',summary.expensesMinor],
    ['Operating profit minor',summary.operatingProfitMinor]];
  return {filename:`TechOrbit_PnL_${summary.range.from}_${summary.range.to}.csv`,csv:'\uFEFF'+lines.map(row=>row.map(q).join(',')).join('\r\n')+'\r\n'};
}
async function reportXlsx(db,input,now=new Date()) {
  const ExcelJS=require('exceljs');
  const summary=profitLoss(db,input,now),items=allEntries(db,input,now);
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Profit and Loss');
  sheet.addRow(['TechOrbit Pharmacy POS - Accrual Profit and Loss']);
  sheet.addRow(['From',summary.range.from,'To',summary.range.to]);
  for(const [label,value] of [['Invoiced sales including GST',summary.salesGrossMinor],['GST liability',summary.salesGstMinor-summary.returnsGstMinor],
    ['Returns including GST',summary.returnsGrossMinor],['Net revenue excluding GST',summary.netRevenueMinor],
    ['Net batch COGS',summary.cogsMinor],['Gross profit',summary.grossProfitMinor],
    ['Incurred expenses',summary.expensesMinor],['Operating profit',summary.operatingProfitMinor]])sheet.addRow([label,value/100]);
  sheet.addRow([]);sheet.addRow(['Type','Date/time','Reference','Gross PKR','GST PKR','COGS PKR','P&L effect PKR']);
  for(const x of items)sheet.addRow([x.kind,x.occurred_at,x.reference,x.gross_minor/100,x.gst_minor/100,x.cogs_minor/100,x.contribution_minor/100]);
  sheet.columns=[{width:34},{width:24},{width:24},{width:16},{width:16},{width:16},{width:18}];
  sheet.getRow(1).font={bold:true,size:14};sheet.getRow(12).font={bold:true};
  for(let row=3;row<=10;row++)sheet.getCell(row,2).numFmt='#,##0.00;[Red](#,##0.00)';
  for(let row=13;row<=sheet.rowCount;row++)for(let col=4;col<=7;col++)sheet.getCell(row,col).numFmt='#,##0.00;[Red](#,##0.00)';
  const buffer=Buffer.from(await book.xlsx.writeBuffer());
  return {filename:`TechOrbit_PnL_${summary.range.from}_${summary.range.to}.xlsx`,base64:buffer.toString('base64')};
}
function reportPdf(db,input,now=new Date()) {
  const {jsPDF}=require('jspdf');
  const summary=profitLoss(db,input,now),items=allEntries(db,input,now);
  if(items.length>10000)throw Error('PDF report is too large; use CSV or Excel');
  const doc=new jsPDF({unit:'pt',format:'a4'}),pageHeight=doc.internal.pageSize.height;
  const amount=n=>(n/100).toFixed(2);
  let y=42;
  const line=(left,right='',bold=false)=>{if(y>pageHeight-42){doc.addPage();y=42}doc.setFont('helvetica',bold?'bold':'normal');doc.text(String(left).slice(0,70),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
  line('TechOrbit Pharmacy POS - Accrual Profit and Loss','',true);
  line(`${summary.range.from} to ${summary.range.to}`);y+=10;
  for(const [label,value] of [['Invoiced sales incl GST',summary.salesGrossMinor],['Net GST liability',summary.salesGstMinor-summary.returnsGstMinor],
    ['Returns incl GST',summary.returnsGrossMinor],['Net revenue ex GST',summary.netRevenueMinor],
    ['Net batch COGS',summary.cogsMinor],['Gross profit',summary.grossProfitMinor],
    ['Incurred expenses',summary.expensesMinor],['Operating profit',summary.operatingProfitMinor]])line(label,`PKR ${amount(value)}`,label==='Operating profit');
  y+=12;line('Date / Type / Reference','P&L effect PKR',true);
  for(const row of items)line(`${row.occurred_at.slice(0,16)} / ${row.kind} / ${row.reference}`,amount(row.contribution_minor));
  const bytes=Buffer.from(doc.output('arraybuffer'));
  return {filename:`TechOrbit_PnL_${summary.range.from}_${summary.range.to}.pdf`,base64:bytes.toString('base64')};
}
module.exports={reportRange,profitLoss,reportEntries,reportCsv,reportXlsx,reportPdf};
