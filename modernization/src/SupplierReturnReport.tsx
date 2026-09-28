import {useEffect,useState} from 'react';
import {money,dateLabel} from './shared';
import type {SupplierReturnReportInput} from './contracts';

const initial:SupplierReturnReportInput={range:'7d',dayMode:'official',from:'',to:'',supplier:'',product:'',generic:'',category:'',brand:'',batch:''};
type Summary=Awaited<ReturnType<typeof window.pharmacy.supplierReturnSummary>>;
type Entries=Awaited<ReturnType<typeof window.pharmacy.supplierReturnEntries>>;

export function SupplierReturnReport(){
 const [draft,setDraft]=useState<SupplierReturnReportInput>(initial),[applied,setApplied]=useState<SupplierReturnReportInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null),[entries,setEntries]=useState<Entries|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.supplierReturnSummary(applied),window.pharmacy.supplierReturnEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof SupplierReturnReportInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Supplier Return Report</h1><p>Posted purchase returns and supplier settlement</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.supplierReturnExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} supplier return report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
   <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {draft.range==='custom'&&<><label>From<input aria-label="Supplier return from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Supplier return to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {field('supplier','Supplier')}{field('product','Product name or SKU')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('batch','Original batch')}
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'Purchase-return lines and actual supplier settlements.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Supplier return totals</h2>{summary&&<>
   <p>Returned stock value: PKR {money(summary.totals.returnMinor)} · Payable credit: PKR {money(summary.totals.payableCreditMinor)} · Actual refund: PKR {money(summary.totals.refundMinor)} · Returns: {summary.totals.returnCount}</p>
   {summary.groups.length?<table><thead><tr><th>Day</th><th>Purchase invoice</th><th>Supplier</th><th>Reason</th><th className="number">Returned value</th><th className="number">Payable credit</th><th className="number">Actual refund</th></tr></thead><tbody>{summary.groups.map(row=><tr key={row.returnId}><td>{dateLabel(row.day)}</td><td>{row.invoice}</td><td>{row.supplier}</td><td>{row.reason}</td><td className="number">{money(row.returnMinor)}</td><td className="number">{money(row.payableCreditMinor)}</td><td className="number">{money(row.refundMinor)}</td></tr>)}</tbody></table>:<p>No supplier returns match these filters.</p>}
  </>}</section>
  <section className="panel"><h2>Returned stock lines</h2>{entries?.items.length?<table><thead><tr><th>Day</th><th>Purchase</th><th>Medicine</th><th>Batch</th><th>Quantity</th><th className="number">Returned value</th><th className="number">Payable credit</th><th className="number">Actual refund</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{dateLabel(row.day)}</td><td>{row.invoice}</td><td>{row.medicine}</td><td>{row.batch}</td><td>{row.quantity}</td><td className="number">{money(row.returnMinor)}</td><td className="number">{money(row.payableCreditMinor)}</td><td className="number">{money(row.refundMinor)}</td></tr>)}</tbody></table>:<p>No supplier return lines on this page.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
