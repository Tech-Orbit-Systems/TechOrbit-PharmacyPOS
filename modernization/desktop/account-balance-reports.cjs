const {dayKey,validDate}=require('./ranges.cjs');
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const titles={customer:'Customer Receivable Report',supplier:'Supplier Payable Report'};
function data(db,input={},options={}){
 const type=options.type||'customer';
 if(!titles[type])throw Error('Choose a supported balance report');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid account report filters');
 for(const key of ['party','reference','dueFrom','dueTo']){
  if(input[key]!=null&&typeof input[key]!=='string')throw Error('Choose valid account report filters');
  if(String(input[key]||'').length>100)throw Error('Account filter is too long');
 }
 if(input.dueFrom)validDate(input.dueFrom);if(input.dueTo)validDate(input.dueTo);
 if(input.dueFrom&&input.dueTo&&input.dueFrom>input.dueTo)throw Error('Due dates are reversed');
 const status=input.status||'open';if(!['all','open','paid','overdue'].includes(status))throw Error('Choose a valid balance status');
 const asOfDate=dayKey(options.now||new Date());
 const rows=type==='supplier'?db.prepare(`SELECT r.id,r.supplier_id party_id,c.name party,c.phone,r.source_type,r.source_id,
  r.original_minor,r.balance_minor,r.due_date,r.status,s.invoice_number reference,s.purchased_at origin_date,s.balance_due_minor source_balance,
  COALESCE((SELECT SUM(p.amount_minor) FROM PurchasePayments p WHERE p.payable_id=r.id),0) payments_minor,
  COALESCE((SELECT SUM(sr.payable_credit_minor) FROM PurchaseReturns sr WHERE sr.purchase_id=s.id),0) credit_minor
  FROM Payables r LEFT JOIN Suppliers c ON c.id=r.supplier_id LEFT JOIN Purchases s ON r.source_type='purchase' AND s.id=CAST(r.source_id AS INTEGER) AND s.supplier_id=r.supplier_id
  ORDER BY c.name,r.due_date,r.id`).all():db.prepare(`SELECT r.id,r.customer_id party_id,c.name party,c.phone,r.source_type,r.source_id,
  r.original_minor,r.balance_minor,r.due_date,r.status,s.invoice_number reference,s.sold_at origin_date,s.balance_due_minor source_balance,
  COALESCE((SELECT SUM(p.amount_minor) FROM ReceivablePayments p WHERE p.receivable_id=r.id),0) payments_minor,
  COALESCE((SELECT SUM(sr.receivable_credit_minor) FROM SaleReturns sr WHERE sr.sale_id=s.id),0) credit_minor
  FROM Receivables r LEFT JOIN Customers c ON c.id=r.customer_id LEFT JOIN Sales s ON r.source_type='sale' AND s.id=CAST(r.source_id AS INTEGER)
  ORDER BY c.name,r.due_date,r.id`).all();
 if(rows.length>10000)throw Error('Balance report exceeds 10,000 accounts; reconcile or narrow source data');
 const items=rows.map(row=>{
  const sourceVerified=row.source_type===(type==='supplier'?'purchase':'sale')&&row.source_balance!=null;
  if(!sourceVerified&&type==='customer')throw Error('Receivable source cannot be reconciled to a saved sale');
  if(type==='supplier'&&row.source_type==='purchase'&&!sourceVerified)throw Error('Supplier payable source cannot be reconciled to a saved purchase');
  if(row.original_minor-row.payments_minor-row.credit_minor!==row.balance_minor||sourceVerified&&row.source_balance!==row.balance_minor)
   throw Error('Account payments and credits do not reconcile to the saved balance');
  const overdue=Boolean(row.balance_minor>0&&row.due_date&&row.due_date<asOfDate);
  const daysOverdue=overdue?Math.ceil((Date.parse(asOfDate+'T00:00:00Z')-Date.parse(row.due_date+'T00:00:00Z'))/86400000):0;
  return {id:row.id,type,sourceVerified,partyId:row.party_id,party:row.party||'Not linked',phone:row.phone||'',reference:row.reference||`Account #${row.id} (source not linked)`,
   originDate:row.origin_date||'',dueDate:row.due_date||'',originalMinor:row.original_minor,paymentsMinor:row.payments_minor,
   creditMinor:row.credit_minor,balanceMinor:row.balance_minor,status:row.status,overdue,daysOverdue};
 }).filter(row=>{
  const match=(value,needle)=>!needle?.trim()||value.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());
  return match(row.party,input.party)&&match(row.reference,input.reference)&&(!input.dueFrom||row.dueDate>=input.dueFrom)&&(!input.dueTo||(row.dueDate&&row.dueDate<=input.dueTo))&&
   (status==='all'||status==='open'&&row.balanceMinor>0||status==='paid'&&row.balanceMinor===0||status==='overdue'&&row.overdue);
 });
 return {asOfDate,type,title:titles[type],items};
}
function accountBalanceSummary(db,input={},options={}){
 const {asOfDate,type,title,items}=data(db,input,options),groups=new Map();
 for(const row of items){let group=groups.get(row.partyId);
  if(!group){group={partyId:row.partyId,party:row.party,accountCount:0,originalMinor:0,paymentsMinor:0,creditMinor:0,balanceMinor:0,overdueMinor:0};groups.set(row.partyId,group)}
  group.accountCount++;for(const field of ['originalMinor','paymentsMinor','creditMinor','balanceMinor'])group[field]+=row[field];
  if(row.overdue)group.overdueMinor+=row.balanceMinor;
 }
 const parties=[...groups.values()],totals={accountCount:items.length,partyCount:parties.length,originalMinor:0,paymentsMinor:0,creditMinor:0,balanceMinor:0,overdueMinor:0};
 for(const row of parties)for(const field of ['originalMinor','paymentsMinor','creditMinor','balanceMinor','overdueMinor'])totals[field]+=row[field];
 if(totals.originalMinor-totals.paymentsMinor-totals.creditMinor!==totals.balanceMinor)throw Error('Balance report totals do not reconcile');
 return {asOfDate,type,title,items,parties,totals,scope:'Current saved account balances including later settlements and return credits. Source-not-linked accounts are explicitly labelled and only verified against the saved account equation, not an original invoice. Original amount is debt at creation after any initial payment; later payments and credits are separate. Due-date filters select accounts, not settlement activity. Overdue is positive balance with due date before today in Pakistan; due today is not overdue. This is not a historical balance snapshot.'};
}
function accountBalanceEntries(db,input={},options={}){
 const {items}=data(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:items.length>page*pageSize,items:items.slice((page-1)*pageSize,page*pageSize)};
}
function accountBalanceCsv(db,input={},options={}){
 const r=accountBalanceSummary(db,input,options),rows=[[r.title],['As of',r.asOfDate],['Scope',r.scope],[],['Party','Reference','Origin date','Due date','Original debt minor','Later payments minor','Return credits minor','Balance minor','Status','Days overdue'],
 ...r.items.map(x=>[x.party,x.reference,x.originDate,x.dueDate,x.originalMinor,x.paymentsMinor,x.creditMinor,x.balanceMinor,x.status,x.daysOverdue]),[],
 ['Total original debt minor',r.totals.originalMinor],['Total later payments minor',r.totals.paymentsMinor],['Total return credits minor',r.totals.creditMinor],['Total balance minor',r.totals.balanceMinor],['Total overdue minor',r.totals.overdueMinor]];
 return {filename:`TechOrbit_${r.title.replaceAll(' ','_')}.csv`,csv:'\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'};
}
async function accountBalanceXlsx(db,input={},options={}){
 const ExcelJS=require('exceljs'),r=accountBalanceSummary(db,input,options),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Account Balances');
 sheet.addRow([r.title]);sheet.addRow(['As of',r.asOfDate]);sheet.addRow(['Scope',r.scope]);sheet.addRow([]);
 sheet.addRow(['Party','Reference','Origin date','Due date','Original debt PKR','Later payments PKR','Credits PKR','Balance PKR','Status','Days overdue']);
 for(const x of r.items)sheet.addRow([x.party,x.reference,x.originDate,x.dueDate,x.originalMinor/100,x.paymentsMinor/100,x.creditMinor/100,x.balanceMinor/100,x.status,x.daysOverdue]);
 sheet.addRow(['Total balance PKR',r.totals.balanceMinor/100]);sheet.addRow(['Total overdue PKR',r.totals.overdueMinor/100]);sheet.getRow(1).font={bold:true,size:14};sheet.getRow(5).font={bold:true};sheet.columns=Array.from({length:10},()=>({width:22}));
 return {filename:`TechOrbit_${r.title.replaceAll(' ','_')}.xlsx`,base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
function accountBalancePdf(db,input={},options={}){
 const {jsPDF}=require('jspdf'),r=accountBalanceSummary(db,input,options),doc=new jsPDF({unit:'pt',format:'a4'});let y=42;
 const line=(left,right='')=>{if(y>780){doc.addPage();y=42}doc.text(String(left).slice(0,75),42,y);if(right)doc.text(String(right),550,y,{align:'right'});y+=17};
 line(r.title);line(`As of ${r.asOfDate}`);line('Current balance',`PKR ${(r.totals.balanceMinor/100).toFixed(2)}`);line('Overdue',`PKR ${(r.totals.overdueMinor/100).toFixed(2)}`);
 for(const x of r.items)line(`${x.party} / ${x.reference} / ${x.dueDate}`,`PKR ${(x.balanceMinor/100).toFixed(2)}`);
 return {filename:`TechOrbit_${r.title.replaceAll(' ','_')}.pdf`,base64:Buffer.from(doc.output('arraybuffer')).toString('base64')};
}
module.exports={accountBalanceSummary,accountBalanceEntries,accountBalanceCsv,accountBalanceXlsx,accountBalancePdf};
