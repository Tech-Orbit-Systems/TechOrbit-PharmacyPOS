import {useEffect,useState} from 'react';
import type {ProfitLossReport,ReportEntries} from './contracts';
import {money,dateLabel} from './shared';
import {DailySales} from './DailySales';
import {SalesByMedicine} from './SalesByMedicine';

function ProfitLoss(){
 const [range,setRange]=useState('1m'),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [page,setPage]=useState(1),[summary,setSummary]=useState<ProfitLossReport|null>(null),[entries,setEntries]=useState<ReportEntries|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(range==='custom'&&(!from||!to))return;
  let active=true;setBusy(true);setError('');
  const input={range,from,to};
  Promise.all([window.pharmacy.reportProfitLoss(input),window.pharmacy.reportEntries({...input,page})])
   .then(([a,b])=>{if(active){setSummary(a);setEntries(b)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[range,from,to,page]);
 const changeRange=(value:string)=>{setRange(value);setPage(1)};
 const changeDate=(value:string,which:'from'|'to')=>{which==='from'?setFrom(value):setTo(value);setPage(1)};
 return <>
  <div className="page-title"><div><h1>Reports</h1><p>Accrual profit and loss · Pakistan dates</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const result=await window.pharmacy.reportExport({range,from,to,format});if(result.saved)setNotice(`${format.toUpperCase()} report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Profit and loss</h2>
   <div className="segmented" aria-label="Report date range">{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>changeRange(value)}>{label}</button>)}</div>
   {range==='custom'&&<div className="custom-dates"><label>From<input type="date" aria-label="Report from date" value={from} onChange={e=>changeDate(e.target.value,'from')}/></label><label>To<input type="date" aria-label="Report to date" value={to} onChange={e=>changeDate(e.target.value,'to')}/></label></div>}
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {summary&&<><p>{dateLabel(summary.range.from)} – {dateLabel(summary.range.to)}</p><table><tbody>
    {[
     ['Listed sales before discounts (ex GST)',summary.listedGrossMinor],['Discounts',-summary.salesDiscountMinor],
     ['GST charged',summary.salesGstMinor],['Invoice rounding',summary.salesRoundingMinor],
     ['Invoiced sales including GST',summary.salesGrossMinor],['Sales GST',-summary.salesGstMinor],['Sales excluding GST',summary.salesExGstMinor],
     ['Customer returns excluding GST',-summary.returnsExGstMinor],['Net revenue excluding GST',summary.netRevenueMinor],
     ['Sold batch cost',-summary.soldCogsMinor],['Returned batch cost',summary.returnedCogsMinor],['Net cost of goods',-summary.cogsMinor],
     ['Gross profit',summary.grossProfitMinor],['Incurred expenses',-summary.expensesMinor],['Operating profit',summary.operatingProfitMinor]
    ].map(([label,value])=><tr key={label}><th>{label}</th><td className="number">PKR {money(value as number)}</td></tr>)}
   </tbody></table><small>Purchases stay in inventory until sold. Customer, supplier and vendor settlements do not create new income or expenses. Savings transfers do not change profit.</small></>}
   {!summary&&!busy&&!error&&<p>Choose dates to view the report.</p>}
  </section>
  <section className="panel"><h2>Report entries</h2><p>Sales, returns and incurred expenses for this period.</p>
   {entries?.items.length?<table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="number">Gross</th><th className="number">GST</th><th className="number">COGS</th><th className="number">P&L effect</th></tr></thead><tbody>{entries.items.map(row=><tr key={`${row.kind}-${row.id}`}><td>{dateLabel(row.occurred_at)}</td><td>{row.kind}</td><td>{row.reference}</td><td className="number">{money(row.gross_minor)}</td><td className="number">{money(row.gst_minor)}</td><td className="number">{money(row.cogs_minor)}</td><td className="number">{money(row.contribution_minor)}</td></tr>)}</tbody></table>:<p>No report entries for these dates.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>
}
export function Reports({canViewProfit,canViewSalesReport}:{canViewProfit:boolean;canViewSalesReport:boolean}){
 const [tab,setTab]=useState<'pnl'|'daily'|'weekly'|'monthly'|'medicine'>(canViewProfit?'pnl':'daily');
 return <><div className="segmented" role="tablist" aria-label="Report type">
  {canViewProfit&&<button role="tab" aria-selected={tab==='pnl'} onClick={()=>setTab('pnl')}>Profit and Loss</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='daily'} onClick={()=>setTab('daily')}>Daily Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='weekly'} onClick={()=>setTab('weekly')}>Weekly Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='monthly'} onClick={()=>setTab('monthly')}>Monthly Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='medicine'} onClick={()=>setTab('medicine')}>Sales by Medicine</button>}
 </div>{tab==='pnl'&&canViewProfit?<ProfitLoss/>:tab==='medicine'?<SalesByMedicine/>:<DailySales key={tab} period={tab==='weekly'?'week':tab==='monthly'?'month':'day'}/>}</>
}
