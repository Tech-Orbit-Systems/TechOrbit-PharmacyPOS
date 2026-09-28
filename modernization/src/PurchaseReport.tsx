import {useEffect,useState} from 'react';
import type {PurchaseReportInput} from './contracts';
import {money,dateLabel} from './shared';

const initial:PurchaseReportInput={range:'7d',dayMode:'official',from:'',to:'',supplier:'',product:'',generic:'',category:'',brand:''};
type Summary=Awaited<ReturnType<typeof window.pharmacy.purchaseSummary>>;
type Entries=Awaited<ReturnType<typeof window.pharmacy.purchaseEntries>>;

export function PurchaseReport(){
 const [draft,setDraft]=useState<PurchaseReportInput>(initial),[applied,setApplied]=useState<PurchaseReportInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null),[entries,setEntries]=useState<Entries|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.purchaseSummary(applied),window.pharmacy.purchaseEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof PurchaseReportInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Purchase Report</h1><p>Posted purchases, linked supplier returns and current payable position</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.purchaseExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} purchase report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
   <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {draft.range==='custom'&&<><label>From<input aria-label="Purchase report from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Purchase report to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {field('supplier','Supplier')}{field('product','Product name or SKU')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'Posted purchases and their linked settlements.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Purchase totals</h2>{summary&&<>
   <p>Posted purchases: PKR {money(summary.totals.totalMinor)} · Linked supplier returns: PKR {money(summary.totals.supplierReturnsMinor)} · Net purchases: PKR {money(summary.totals.netPurchaseMinor)}</p>
   <p>Paid at receiving: PKR {money(summary.totals.paidAtReceivingMinor)} · Later payments: PKR {money(summary.totals.laterPaymentsMinor)} · Current payable: PKR {money(summary.totals.balanceDueMinor)}</p>
   <p>Purchases: {summary.totals.purchaseCount} · Purchased base units: {summary.totals.purchasedBaseQuantity} · Bonus base units: {summary.totals.bonusBaseQuantity}</p>
  </>}</section>
  <section className="panel"><h2>Purchase invoices</h2>{entries?.items.length?<table><thead><tr><th>Day</th><th>Invoice</th><th>Supplier</th><th className="number">Purchase</th><th className="number">Returns</th><th className="number">Net purchase</th><th className="number">Current payable</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{dateLabel(row.day)}</td><td>{row.invoice}</td><td>{row.supplier}</td><td className="number">{money(row.totalMinor)}</td><td className="number">{money(row.supplierReturnsMinor)}</td><td className="number">{money(row.netPurchaseMinor)}</td><td className="number">{money(row.balanceDueMinor)}</td></tr>)}</tbody></table>:<p>No purchases match these filters.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
