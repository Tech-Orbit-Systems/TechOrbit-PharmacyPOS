import {useEffect,useState} from 'react';
import type {BatchStockInput,BatchStockSummary,BatchStockRow} from './contracts';
import {money} from './shared';

const initial:BatchStockInput={q:'',generic:'',category:'',brand:'',supplier:'',batch:'',status:'all',activeOnly:false};
export function BatchStockReport(){
 const [draft,setDraft]=useState<BatchStockInput>(initial),[applied,setApplied]=useState<BatchStockInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<BatchStockSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:BatchStockRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.batchStockSummary(applied),window.pharmacy.batchStockEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:'q'|'generic'|'category'|'brand'|'supplier'|'batch',label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Batch Stock Report</h1><p>Live batch quantities and movement components</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.batchStockExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} batch stock report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Stock status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as BatchStockInput['status']})}><option value="all">All</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="expired">Expired</option><option value="near">Near expiry</option></select></label>
   {field('q','Product, SKU or batch')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Supplier')}{field('batch','Batch number')}
   <label><input type="checkbox" checked={Boolean(draft.activeOnly)} onChange={e=>setDraft({...draft,activeOnly:e.target.checked})}/> Active products only</label>
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'Live batches, including zero stock for traceability.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Batch totals</h2>{summary&&<>
   <p>As of {summary.asOfDate} · Batches: {summary.totals.batchCount} · Zero stock: {summary.totals.zeroStockBatches} · Expired: {summary.totals.expiredBatches}</p>
   <p>Physical base units: {summary.totals.physicalQuantity} · Sellable base units: {summary.totals.sellableQuantity}{summary.costVisible&&<> · Estimated stock value: PKR {money(summary.totals.stockValueMinor||0)}</>}</p>
  </>}</section>
  <section className="panel"><h2>Batch detail</h2>{entries?.items.length?<table><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>Status</th><th className="number">Physical</th><th className="number">Sellable</th><th className="number">Purchased</th><th className="number">Bonus</th><th className="number">Sold</th>{summary?.costVisible&&<th className="number">Value</th>}</tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.batchNumber||'Not recorded'}</td><td>{row.expiryDate||'Not recorded'}</td><td>{row.stockStatus}</td><td className="number">{row.physicalQuantity}</td><td className="number">{row.sellableQuantity}</td><td className="number">{row.purchasedQuantity}</td><td className="number">{row.bonusQuantity}</td><td className="number">{row.soldQuantity}</td>{summary?.costVisible&&<td className="number">{money(row.stockValueMinor||0)}</td>}</tr>)}</tbody></table>:<p>No batches match these filters.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
