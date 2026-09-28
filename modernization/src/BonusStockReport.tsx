import {useEffect,useState} from 'react';
import type {PurchaseReportInput,BonusStockSummary,BonusStockRow} from './contracts';
import {money,dateLabel} from './shared';

const initial:PurchaseReportInput={range:'7d',dayMode:'official',from:'',to:'',supplier:'',product:'',generic:'',category:'',brand:''};
export function BonusStockReport(){
 const [draft,setDraft]=useState<PurchaseReportInput>(initial),[applied,setApplied]=useState<PurchaseReportInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<BonusStockSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:BonusStockRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.bonusStockSummary(applied),window.pharmacy.bonusStockEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof PurchaseReportInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
  <div className="page-title"><div><h1>Bonus Stock/Scheme Report</h1><p>Free units received with posted purchases</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.bonusStockExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} bonus stock report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
   <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {draft.range==='custom'&&<><label>From<input aria-label="Bonus stock from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Bonus stock to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {field('supplier','Supplier')}{field('product','Product name')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}
   </div><button className="primary">Run report</button></form><small>{summary?.scope||'Posted bonus purchase lines and their original batch receipts.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Bonus totals</h2>{summary&&<>
   <p>Paid base units: {summary.totals.purchasedBaseQuantity} · Bonus base units: {summary.totals.bonusBaseQuantity} · Total received: {summary.totals.receivedBaseQuantity} · Paid cost: PKR {money(summary.totals.paidCostMinor)}</p>
   <p>Products: {summary.products.length} · Bonus purchase lines: {summary.totals.lineCount}</p>
   {summary.products.length?<table><thead><tr><th>Medicine</th><th className="number">Paid base units</th><th className="number">Bonus base units</th><th className="number">Received</th><th className="number">Paid cost</th></tr></thead><tbody>{summary.products.map(row=><tr key={row.productId}><td>{row.medicine}</td><td className="number">{row.purchasedBaseQuantity}</td><td className="number">{row.bonusBaseQuantity}</td><td className="number">{row.receivedBaseQuantity}</td><td className="number">{money(row.paidCostMinor)}</td></tr>)}</tbody></table>:<p>No bonus stock matches these filters.</p>}
  </>}</section>
  <section className="panel"><h2>Bonus purchase lines</h2>{entries?.items.length?<table><thead><tr><th>Day</th><th>Supplier</th><th>Invoice</th><th>Medicine</th><th>Batch</th><th className="number">Paid units</th><th className="number">Bonus units</th><th className="number">Effective base cost</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{dateLabel(row.day)}</td><td>{row.supplier}</td><td>{row.invoice}</td><td>{row.medicine}</td><td>{row.batch}</td><td className="number">{row.purchasedQuantity}</td><td className="number">{row.bonusQuantity}</td><td className="number">{money(row.effectiveUnitCostMinor)}</td></tr>)}</tbody></table>:<p>No bonus lines match these filters.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>;
}
