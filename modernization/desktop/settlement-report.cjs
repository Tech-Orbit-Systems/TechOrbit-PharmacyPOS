const {rangeFor}=require('./ranges.cjs');
const exportsTable=require('./tabular-report-exports.cjs');
const sources={
 customer:{table:'ReceivablePayments',party:'Customers',partyKey:'customer_id',accountKey:'receivable_id',origin:'Sales',originKey:'sale_id',reference:'invoice_number',at:'collected_at',movement:'receivable_payment',direction:'in'},
 supplier:{table:'PurchasePayments',party:'Suppliers',partyKey:'supplier_id',accountKey:'payable_id',origin:'Purchases',originKey:'purchase_id',reference:'invoice_number',at:'paid_at',movement:'purchase_payment',direction:'out'},
 vendor:{table:'ExpensePayments',party:'Vendors',partyKey:'vendor_id',accountKey:'payable_id',origin:'Expenses',originKey:'expense_id',reference:'reference',at:'paid_at',movement:'expense_payment',direction:'out'},
};
function settlementSummary(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid settlement filters');
 const range=rangeFor(input,options.now||new Date()),type=input.type||'all',method=input.method||'all';
 if(!['all',...Object.keys(sources)].includes(type)||!['all','cash','card','digital','bank_transfer','mobile_wallet','other'].includes(method))throw Error('Choose valid settlement filters');
 for(const key of ['party','reference','actor'])if(input[key]!=null&&(typeof input[key]!=='string'||input[key].length>100))throw Error('Choose valid settlement filters');
 const allowed=options.vendorVisible===false?['customer','supplier']:Object.keys(sources);
 if(type!=='all'&&!allowed.includes(type))throw Error('Your role does not allow vendor dues');
 let items=[];
 for(const type of allowed.filter(x=>input.type==='all'||!input.type||x===input.type)){
  const s=sources[type];
  const rows=db.prepare(`SELECT p.id,p.${s.originKey} origin_id,p.${s.accountKey} account_id,p.${s.partyKey} party_id,c.name party,p.reference payment_reference,o.${s.reference} origin_reference,p.amount_minor,p.method,p.${s.at} occurred_at,u.display_name actor,p.created_by actor_id
   FROM ${s.table} p LEFT JOIN ${s.party} c ON c.id=p.${s.partyKey} LEFT JOIN ${s.origin} o ON o.id=p.${s.originKey} LEFT JOIN Users u ON u.id=p.created_by
   WHERE julianday(p.${s.at})>=julianday(?) AND julianday(p.${s.at})<julianday(?) ORDER BY p.${s.at},p.id`).all(range.start,range.end);
  if(rows.length>10000)throw Error('Settlement report exceeds 10,000 payments; narrow dates');
  for(const r of rows){
   const money=db.prepare('SELECT direction,method,amount_minor,occurred_at FROM MoneyMovements WHERE reference_type=? AND reference_id=?').all(s.movement,String(r.id));
   if(money.length!==1||money[0].direction!==s.direction||money[0].method!==r.method||money[0].amount_minor!==r.amount_minor||Date.parse(money[0].occurred_at)!==Date.parse(r.occurred_at))throw Error('Settlement does not reconcile to its saved money movement');
   items.push({id:r.id,type,accountId:r.account_id,partyId:r.party_id,party:r.party||'Not linked',reference:r.payment_reference||'',originReference:r.origin_reference||`${s.origin} #${r.origin_id}`,occurredAt:r.occurred_at,amountMinor:r.amount_minor,method:r.method,direction:s.direction,actorId:r.actor_id,actor:r.actor||'Not recorded'});
  }
  const orphan=db.prepare(`SELECT 1 FROM MoneyMovements m LEFT JOIN ${s.table} p ON CAST(p.id AS TEXT)=m.reference_id WHERE m.reference_type=? AND julianday(m.occurred_at)>=julianday(?) AND julianday(m.occurred_at)<julianday(?) AND p.id IS NULL LIMIT 1`).get(s.movement,range.start,range.end);
  if(orphan)throw Error('Settlement money movement has no saved payment');
 }
 const match=(value,needle)=>!needle?.trim()||value.toLowerCase().includes(needle.trim().toLowerCase());
 items=items.filter(x=>(method==='all'||x.method===method)&&match(x.party,input.party)&&match(`${x.reference} ${x.originReference}`,input.reference)&&match(x.actor,input.actor));
 items.sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.type.localeCompare(b.type)||b.id-a.id);
 const totals={count:items.length,inMinor:0,outMinor:0,netMinor:0};for(const x of items)totals[x.direction==='in'?'inMinor':'outMinor']+=x.amountMinor;totals.netMinor=totals.inMinor-totals.outMinor;
 const methods=[...new Set(items.map(x=>x.method))].map(method=>({method,inMinor:items.filter(x=>x.method===method&&x.direction==='in').reduce((sum,x)=>sum+x.amountMinor,0),outMinor:items.filter(x=>x.method===method&&x.direction==='out').reduce((sum,x)=>sum+x.amountMinor,0)}));
 return {range:{from:range.from,to:range.to},items,totals,methods,scope:'Later customer collections and supplier/vendor payments by payment date in Pakistan. Each payment matches one saved money movement. Initial invoice payments, return credits/refunds and savings transfers are excluded. Net is settlement cash flow, not revenue or profit. Vendor scope follows expense permission.'};
}
function settlementEntries(db,input={},options={}){
 const r=settlementSummary(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:r.items.length>page*pageSize,items:r.items.slice((page-1)*pageSize,page*pageSize)};
}
function table(db,input,options){const r=settlementSummary(db,input,options);return {title:'Due Payment/Collection Report',metadata:[['Dates',`${r.range.from} to ${r.range.to}`],['Scope',r.scope]],headers:['Account type','Party','Original reference','Payment reference','Payment date','Method','Direction','Amount minor','Recorded by'],rows:r.items.map(x=>[x.type,x.party,x.originReference,x.reference,x.occurredAt,x.method,x.direction,x.amountMinor,x.actor]),totals:[['Payment count',r.totals.count],['Collected minor',r.totals.inMinor],['Paid minor',r.totals.outMinor],['Net cash flow minor',r.totals.netMinor],...r.methods.map(x=>[`${x.method} in/out minor`,`${x.inMinor}/${x.outMinor}`])]};}
module.exports={settlementSummary,settlementEntries,settlementCsv:(db,input,options)=>exportsTable.csvReport(table(db,input,options)),settlementXlsx:(db,input,options)=>exportsTable.xlsxReport(table(db,input,options)),settlementPdf:(db,input,options)=>exportsTable.pdfReport(table(db,input,options))};
