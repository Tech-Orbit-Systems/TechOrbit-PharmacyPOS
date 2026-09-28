import {useEffect,useState} from 'react';
import type {LowStockInput,LowStockSummary,LowStockRow} from './contracts';

const initial:LowStockInput={q:'',generic:'',category:'',brand:'',supplier:'',status:'all'};
export function LowStockReport(){
 const [draft,setDraft]=useState<LowStockInput>(initial),[applied,setApplied]=useState<LowStockInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<LowStockSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:LowStockRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.lowStockSummary(applied),window.pharmacy.lowStockEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof LowStockInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Low Stock Report</h1><p>Live sellable stock against configured reorder levels</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.lowStockExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} low stock report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Stock status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as LowStockInput['status']})}><option value="all">Low and out of stock</option><option value="low">Low stock only</option><option value="out">Out of stock only</option></select></label>
   {field('q','Product name or SKU')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Default supplier')}
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'A live inventory snapshot; only active products are included.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Stock alerts</h2>{summary&&<>
   <p>As of {summary.asOfDate} · Low: {summary.totals.lowCount} · Out: {summary.totals.outCount} · Units to clear alerts: {summary.totals.unitsToClearAlert}</p>
   <p>Physical base units: {summary.totals.physicalQuantity} · Sellable: {summary.totals.sellableQuantity} · Expired: {summary.totals.expiredQuantity}</p>
  </>}</section>
  <section className="panel"><h2>Products needing stock</h2>{entries?.items.length?<table><thead><tr><th>Product</th><th>Supplier</th><th>Status</th><th className="number">Physical</th><th className="number">Sellable</th><th className="number">Threshold</th><th className="number">Units to clear alert</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.productId}><td>{row.medicine}{row.sku?' · '+row.sku:''}</td><td>{row.supplier||'Not set'}</td><td>{row.status==='out'?'Out of stock':'Low stock'}</td><td className="number">{row.physicalQuantity}</td><td className="number">{row.sellableQuantity}</td><td className="number">{row.threshold}</td><td className="number">{row.unitsToClearAlert}</td></tr>)}</tbody></table>:<p>No low stock matches these filters.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
