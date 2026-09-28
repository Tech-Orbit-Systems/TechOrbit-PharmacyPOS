import {useEffect,useState} from 'react';
import type {ExpiryInput,ExpirySummary,ExpiryRow} from './contracts';
import {money} from './shared';

const initial:ExpiryInput={q:'',generic:'',category:'',brand:'',supplier:'',horizon:'all'};
const bandName:Record<string,string>={expired:'Expired',30:'Next 30 days',60:'Days 31-60',90:'Days 61-90',safe:'Beyond 90 days',none:'No expiry'};
export function ExpiryReport(){
 const [draft,setDraft]=useState<ExpiryInput>(initial),[applied,setApplied]=useState<ExpiryInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<ExpirySummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:ExpiryRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.expirySummary(applied),window.pharmacy.expiryEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof ExpiryInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Expiry Report</h1><p>Live batch expiry, physical and sellable stock</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.expiryExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} expiry report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Expiry horizon<select value={draft.horizon} onChange={e=>setDraft({...draft,horizon:e.target.value as ExpiryInput['horizon']})}><option value="all">All positive stock</option><option value="expired">Expired</option><option value="30">Next 30 days</option><option value="60">Next 60 days</option><option value="90">Next 90 days</option><option value="safe">Beyond 90 days</option><option value="none">No expiry</option></select></label>
   {field('q','Product, SKU or batch')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Supplier')}
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'Live positive-stock batches in Pakistan civil date.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Expiry totals</h2>{summary&&<>
   <p>As of {summary.asOfDate} · Batches: {summary.totals.batchCount} · Physical base units: {summary.totals.physicalQuantity} · Sellable base units: {summary.totals.sellableQuantity}</p>
   {summary.costVisible&&<p>Physical value: PKR {money(summary.totals.physicalValueMinor||0)} · Sellable value: PKR {money(summary.totals.sellableValueMinor||0)}</p>}
   <table><thead><tr><th>Expiry band</th><th className="number">Batches</th><th className="number">Physical</th><th className="number">Sellable</th>{summary.costVisible&&<th className="number">Physical value</th>}</tr></thead><tbody>{summary.groups.map(row=><tr key={row.band}><td>{bandName[row.band]}</td><td className="number">{row.batchCount}</td><td className="number">{row.physicalQuantity}</td><td className="number">{row.sellableQuantity}</td>{summary.costVisible&&<td className="number">{money(row.physicalValueMinor||0)}</td>}</tr>)}</tbody></table>
  </>}</section>
  <section className="panel"><h2>Expiry batches</h2>{entries?.items.length?<table><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Band</th><th className="number">Physical</th><th className="number">Sellable</th>{summary?.costVisible&&<th className="number">Physical value</th>}</tr></thead><tbody>{entries.items.map(row=><tr key={row.batchId}><td>{row.medicine}</td><td>{row.batch||'Not recorded'}</td><td>{row.expiryDate||'Not recorded'}</td><td>{bandName[row.band]}</td><td className="number">{row.physicalQuantity}</td><td className="number">{row.sellableQuantity}</td>{summary?.costVisible&&<td className="number">{money(row.physicalValueMinor||0)}</td>}</tr>)}</tbody></table>:<p>No batches match these filters.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
