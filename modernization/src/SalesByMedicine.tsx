import {useEffect,useState} from 'react';
import type {DailySalesInput} from './contracts';
import {money,dateLabel} from './shared';

const initial:DailySalesInput={range:'7d',dayMode:'official',from:'',to:'',product:'',category:'',brand:'',supplier:'',customer:'',cashier:'',method:''};
type Summary=Awaited<ReturnType<typeof window.pharmacy.medicineSummary>>;
type Entries=Awaited<ReturnType<typeof window.pharmacy.medicineEntries>>;
export function SalesByMedicine(){
 const [draft,setDraft]=useState<DailySalesInput>(initial),[applied,setApplied]=useState<DailySalesInput>(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null),[entries,setEntries]=useState<Entries|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.medicineSummary(applied),window.pharmacy.medicineEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof DailySalesInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 const run=(event:React.FormEvent)=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})};
 return <>
  <div className="page-title"><div><h1>Sales by Medicine</h1><p>Saved sale lines and their linked returns</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.medicineExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} medicine sales saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2><form onSubmit={run}><div className="closing-form">
   <label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label>
   <label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
   {draft.range==='custom'&&<><label>From<input aria-label="Medicine sales from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Medicine sales to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {field('product','Product name or SKU')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Recorded batch supplier')}
   {field('customer','Customer name or phone')}{field('cashier','Cashier')}
   <label>Payment method<select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value})}><option value="">All</option>{['cash','card','digital','credit'].map(value=><option value={value} key={value}>{value}</option>)}</select></label>
   </div><button className="primary">Run report</button></form>
   <small>{summary?.scope||'Product filter selects medicine lines. Cost and profit require permission.'}</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>Medicine totals</h2>
   {summary&&<><p>Net sales: PKR {money(summary.totals.netSalesMinor)} · Net GST: PKR {money(summary.totals.gstMinor)}</p>
    {summary.groups.length?<table><thead><tr><th>Medicine</th><th>Generic</th><th>Category</th><th>Brand</th><th>Sold units</th><th>Returned units</th><th className="number">Net sales</th><th className="number">GST</th>{summary.costVisible&&<><th className="number">COGS</th><th className="number">Gross profit</th></>}</tr></thead>
     <tbody>{summary.groups.map(row=><tr key={row.productId}><td>{row.medicine}</td><td>{row.generic}</td><td>{row.category}</td><td>{row.brand}</td><td>{row.soldQuantity}</td><td>{row.returnedQuantity}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td>{summary.costVisible&&<><td className="number">{money(row.cogsMinor)}</td><td className="number">{money(row.grossProfitMinor)}</td></>}</tr>)}</tbody></table>:<p>No medicine sales match these filters.</p>}</>}
  </section>
  <section className="panel"><h2>Sale and return lines</h2>
   {entries?.items.length?<table><thead><tr><th>Day</th><th>Type</th><th>Reference</th><th>Medicine</th><th>Quantity</th><th className="number">Net sales</th><th className="number">GST</th>{summary?.costVisible&&<th className="number">Gross profit</th>}</tr></thead>
    <tbody>{entries.items.map((row,index)=><tr key={`${row.reference}-${row.medicine}-${index}`}><td>{dateLabel(row.day)}</td><td>{row.kind}</td><td>{row.reference}</td><td>{row.medicine}</td><td>{row.quantity}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td>{summary?.costVisible&&<td className="number">{money(row.grossProfitMinor)}</td>}</tr>)}</tbody></table>:<p>No medicine lines on this page.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>
}
