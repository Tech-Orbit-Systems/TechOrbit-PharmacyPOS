import {useEffect,useState} from 'react';
import type {StockMovementInput,StockMovementSummary,StockMovementRow} from './contracts';
const initial:StockMovementInput={range:'7d',dayMode:'official',type:'all',product:'',generic:'',category:'',brand:'',supplier:'',batch:'',reference:''};
const types=['opening','purchase','sale','sale_return','purchase_return','adjustment','transfer'];
export function StockMovementReport(){
 const [draft,setDraft]=useState<StockMovementInput>(initial),[applied,setApplied]=useState<StockMovementInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<StockMovementSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:StockMovementRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.stockMovementSummary(applied),window.pharmacy.stockMovementEntries({...applied,page})])
  .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}}).catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof StockMovementInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <>
 <div className="page-title"><div><h1>Stock Movement Report</h1><p>Saved stock in and stock out with source references</p></div>
 {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.stockMovementExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} stock movement report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}</div>
 <section className="panel"><h2>Filters</h2><form onSubmit={e=>{e.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
 <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
 <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
 {draft.range==='custom'&&<><label>From<input aria-label="Stock movement from date" type="date" value={draft.from||''} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Stock movement to date" type="date" value={draft.to||''} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
 <label>Movement type<select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value})}><option value="all">All</option>{types.map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select></label>
 {field('product','Product name')}{field('generic','Generic name')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Supplier')}{field('batch','Batch number')}{field('reference','Reference ID')}
 </div><button className="primary">Run report</button></form><small>{summary?.scope||'Saved movement ledger rows for the selected period.'}</small>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>
 <section className="panel"><h2>Movement totals</h2>{summary&&<><p>Rows: {summary.totals.count} · Stock in: {summary.totals.inQuantity} · Stock out: {summary.totals.outQuantity} · Net movement: {summary.totals.netQuantity}</p>
 <table><thead><tr><th>Type</th><th className="number">Rows</th><th className="number">In</th><th className="number">Out</th><th className="number">Net</th></tr></thead><tbody>{summary.groups.map(row=><tr key={row.type}><td>{row.type.replaceAll('_',' ')}</td><td className="number">{row.count}</td><td className="number">{row.inQuantity}</td><td className="number">{row.outQuantity}</td><td className="number">{row.netQuantity}</td></tr>)}</tbody></table></>}</section>
 <section className="panel"><h2>Movement entries</h2>{entries?.items.length?<table><thead><tr><th>Day</th><th>Product</th><th>Batch</th><th>Type</th><th className="number">Delta</th><th>Source</th><th>User</th><th>Note</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{row.day}</td><td>{row.medicine}</td><td>{row.batch||'Not recorded'}</td><td>{row.type.replaceAll('_',' ')}</td><td className="number">{row.quantityDelta}</td><td>{row.referenceType} #{row.referenceId}</td><td>{row.userName}</td><td>{row.note}</td></tr>)}</tbody></table>:<p>No movements match these filters.</p>}
 <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div></section>
 </>;
}
