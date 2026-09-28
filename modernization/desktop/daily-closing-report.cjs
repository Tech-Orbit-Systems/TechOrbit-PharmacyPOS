const {rangeFor,dayKey}=require('./ranges.cjs');
const exportsTable=require('./tabular-report-exports.cjs');
const {DailyClosingService}=require('../../infrastructure/sqlite/services/daily-closing');
function dailyClosingSummary(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid closing report filters');
 const range=rangeFor(input,options.now||new Date()),basis=input.basis||'latest',dateBasis=input.dateBasis||'closed';
 if(!['original','latest'].includes(basis)||!['opened','closed'].includes(dateBasis))throw Error('Choose a valid closing snapshot basis');
 for(const key of ['closer','device'])if(input[key]!=null&&(typeof input[key]!=='string'||input[key].length>100))throw Error('Choose valid closing report filters');
 const dateColumn=dateBasis==='opened'?'opened_at':'closed_at';
 const days=db.prepare(`SELECT d.*,u.display_name closer FROM BusinessDays d LEFT JOIN Users u ON u.id=d.closed_by WHERE d.status='closed' AND julianday(d.${dateColumn})>=julianday(?) AND julianday(d.${dateColumn})<julianday(?) ORDER BY d.closed_at DESC,d.id DESC`).all(range.start,range.end);
 if(days.length>10000)throw Error('Closing report exceeds 10,000 days; narrow dates');
 const service=new DailyClosingService(db),match=(value,needle)=>!needle?.trim()||String(value||'').toLowerCase().includes(needle.trim().toLowerCase());
 const items=days.map(day=>{
  const detail=service.detail(day.id),snapshot=basis==='original'?detail.original:detail.current;
  if(snapshot.businessDayId!==day.id||Date.parse(snapshot.closedAt)!==Date.parse(day.closed_at)||!Number.isSafeInteger(snapshot.cashExpectedMinor)||!Number.isSafeInteger(snapshot.cashCountedMinor)||snapshot.cashCountedMinor-snapshot.cashExpectedMinor!==snapshot.cashVarianceMinor)throw Error('Saved daily closing cash snapshot does not reconcile');
  for(const account of snapshot.accounts)if(account.inMinor-account.outMinor!==account.expectedNetMinor||account.actualNetMinor-account.expectedNetMinor!==account.varianceMinor)throw Error('Saved daily closing account snapshot does not reconcile');
  return {id:day.id,openedDate:dayKey(day.opened_at),closedDate:dayKey(day.closed_at),closer:day.closer||'Not recorded',revisionCount:detail.revisions.length,snapshot,revisions:detail.revisions};
 }).filter(x=>match(x.closer,input.closer)&&(!input.device?.trim()||x.snapshot.shifts.some(shift=>match(shift.device_id,input.device))));
 const totals={dayCount:items.length,shiftCount:0,cashVarianceMinor:0,digitalVarianceMinor:0,savingsTransferredMinor:0};
 for(const row of items){totals.shiftCount+=row.snapshot.shiftCount;totals.cashVarianceMinor+=row.snapshot.cashVarianceMinor;totals.savingsTransferredMinor+=row.snapshot.savingsTransferredMinor;totals.digitalVarianceMinor+=row.snapshot.accounts.reduce((sum,x)=>sum+x.varianceMinor,0)}
 return {range:{from:range.from,to:range.to},basis,dateBasis,items,totals,scope:'Saved closed business-day snapshots only; open days are excluded. Original snapshot is retained; latest includes reasoned saved revisions. Dates select Pakistan opening or closing date, so a day may cross midnight. Counter filter selects whole days containing that counter. Variances and actual savings are summed; closing cash balances are not added into a new balance. No live ledger recomputation or new savings assumption.'};
}
function dailyClosingEntries(db,input={},options={}){
 const r=dailyClosingSummary(db,input,options),page=Number(input.page||1),pageSize=Number(input.pageSize||25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:r.items.length>page*pageSize,items:r.items.slice((page-1)*pageSize,page*pageSize)};
}
function table(db,input,options){const r=dailyClosingSummary(db,input,options);return {title:'Daily Closing Report',metadata:[['Dates',`${r.range.from} to ${r.range.to}`],['Snapshot',r.basis],['Date basis',r.dateBasis],['Scope',r.scope]],headers:['Business day','Opened at','Closed at','Closed by','Revisions','Snapshot revision','Cash expected minor','Cash counted minor','Cash variance minor','Savings transferred minor','Closing/revision reason'],rows:r.items.map(x=>[x.id,x.snapshot.openedAt,x.snapshot.closedAt,x.closer,x.revisionCount,x.snapshot.revisionNumber||0,x.snapshot.cashExpectedMinor,x.snapshot.cashCountedMinor,x.snapshot.cashVarianceMinor,x.snapshot.savingsTransferredMinor,x.snapshot.revisionReason||x.snapshot.reason||'']),totals:[['Closed days',r.totals.dayCount],['Shifts',r.totals.shiftCount],['Cash variance minor',r.totals.cashVarianceMinor],['Digital variance minor',r.totals.digitalVarianceMinor],['Actual savings transferred minor',r.totals.savingsTransferredMinor],...r.items.flatMap(x=>x.snapshot.accounts.map(a=>[`Day ${x.id} ${a.kind} ${a.name} expected/actual/variance minor`,`${a.expectedNetMinor}/${a.actualNetMinor}/${a.varianceMinor}`])),...r.items.flatMap(x=>x.snapshot.shifts.map(s=>[`Day ${x.id} shift ${s.id} ${s.device_id}`,`${s.opened_at} to ${s.closed_at}; counted cash minor ${s.counted_cash_minor}`]))]};}
module.exports={dailyClosingSummary,dailyClosingEntries,dailyClosingCsv:(db,input,options)=>exportsTable.csvReport(table(db,input,options)),dailyClosingXlsx:(db,input,options)=>exportsTable.xlsxReport(table(db,input,options)),dailyClosingPdf:(db,input,options)=>exportsTable.pdfReport(table(db,input,options))};
