import {useEffect,useState} from 'react';
import type {DailySalesInput} from './contracts';
import {money,dateLabel} from './shared';

const initial:DailySalesInput={range:'7d',dayMode:'official',from:'',to:'',product:'',generic:'',category:'',brand:'',supplier:'',customer:'',cashier:'',method:''};
type Summary=Awaited<ReturnType<typeof window.pharmacy.customerReturnSummary>>;
type Entries=Awaited<ReturnType<typeof window.pharmacy.customerReturnEntries>>;

export function CustomerReturnReport(){
 const [draft,setDraft]=useState<DailySalesInput>(initial),[applied,setApplied]=useState<DailySalesInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null),[entries,setEntries]=useState<Entries|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.customerReturnSummary(applied),window.pharmacy.customerReturnEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof DailySalesInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 const run=(event:React.FormEvent)=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})};
 return <>
  <div className="page-title"><div><h1>Customer Return Report</h1><p>Posted customer returns and original invoice links</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.customerReturnExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} customer return report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={run}><div className="closing-form">
   <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
   <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {draft.range==='custom'&&<><label>From<input aria-label="Customer return from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Customer return to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {field('product','Product name or SKU')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Recorded batch supplier')}
   {field('customer','Customer name or phone')}{field('cashier','Original cashier')}
   <label>Original payment method<select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value})}><option value="">All</option>{['cash','card','digital','credit'].map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   </div><button className="primary">Run report</button></form>
   <small>{summary?.scope||'Product filters select saved return lines. Cost requires permission.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Return totals</h2>{summary&&<>
   <p>Returns: PKR {money(summary.totals.returnMinor)} · GST reversed: PKR {money(summary.totals.gstMinor)} · Cash refunds: PKR {money(summary.totals.refundMinor)} · Receivable credits: PKR {money(summary.totals.receivableCreditMinor)}</p>
   <p>Returns: {summary.totals.returnCount} · Restocked units: {summary.totals.restockQuantity} · Disposed units: {summary.totals.disposalQuantity}</p>
   {summary.groups.length?<table><thead><tr><th>Day</th><th>Original invoice</th><th>Customer</th><th>Reason</th><th className="number">Return</th><th className="number">Refund</th><th className="number">Credit</th>{summary.costVisible&&<th className="number">COGS reversal</th>}</tr></thead><tbody>{summary.groups.map(row=><tr key={row.returnId}><td>{dateLabel(row.day)}</td><td>{row.invoice}</td><td>{row.customer}</td><td>{row.reason}</td><td className="number">{money(row.returnMinor)}</td><td className="number">{money(row.refundMinor)}</td><td className="number">{money(row.receivableCreditMinor)}</td>{summary.costVisible&&<td className="number">{money(row.cogsMinor)}</td>}</tr>)}</tbody></table>:<p>No customer returns match these filters.</p>}
  </>}</section>
  <section className="panel"><h2>Returned medicine lines</h2>{entries?.items.length?<table><thead><tr><th>Day</th><th>Invoice</th><th>Medicine</th><th>Quantity</th><th>Restocked</th><th>Disposed</th><th className="number">Return</th><th className="number">GST</th>{summary?.costVisible&&<th className="number">COGS reversal</th>}</tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{dateLabel(row.day)}</td><td>{row.invoice}</td><td>{row.medicine}</td><td>{row.quantity}</td><td>{row.restockQuantity}</td><td>{row.disposalQuantity}</td><td className="number">{money(row.returnMinor)}</td><td className="number">{money(row.gstMinor)}</td>{summary?.costVisible&&<td className="number">{money(row.cogsMinor)}</td>}</tr>)}</tbody></table>:<p>No return lines on this page.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
