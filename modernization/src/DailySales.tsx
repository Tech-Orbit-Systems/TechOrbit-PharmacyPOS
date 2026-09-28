import {useEffect,useState} from 'react';
import type {DailySalesInput,DailySalesSummary,DailySalesEntries,DailySalesRow} from './contracts';
import {money,dateLabel} from './shared';

const initial:DailySalesInput={range:'7d',dayMode:'official',from:'',to:'',product:'',category:'',brand:'',supplier:'',customer:'',cashier:'',method:''};
const amounts:(keyof DailySalesRow)[]=['salesMinor','returnsMinor','netSalesMinor','gstMinor','netExGstMinor','discountMinor','paidAtSaleMinor','creditCreatedMinor','refundMinor','receivableCreditMinor'];
const labels:Record<string,string>={salesMinor:'Sales incl GST',returnsMinor:'Returns incl GST',netSalesMinor:'Net sales incl GST',gstMinor:'Net GST',netExGstMinor:'Net sales ex GST',discountMinor:'Discounts',paidAtSaleMinor:'Paid at sale',creditCreatedMinor:'Credit created',refundMinor:'Cash/digital refunded',receivableCreditMinor:'Due credited',cogsMinor:'Net batch COGS',grossProfitMinor:'Gross profit'};
export function DailySales({period='day'}:{period?:'day'|'week'|'month'}){
 const [draft,setDraft]=useState<DailySalesInput>({...initial,period}),[applied,setApplied]=useState<DailySalesInput>({...initial,period}),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<DailySalesSummary|null>(null),[entries,setEntries]=useState<DailySalesEntries|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  Promise.all([window.pharmacy.dailySalesSummary(applied),window.pharmacy.dailySalesEntries({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page]);
 const field=(key:keyof DailySalesInput,label:string)=><label key={key}>{label}<input value={draft[key]||''} maxLength={100} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 const run=(event:React.FormEvent)=>{event.preventDefault();setPage(1);setNotice('');setApplied({...draft})};
 const moneyCell=(value:number|null|undefined)=>value==null?'—':'PKR '+money(value);
 const cols=summary?.costVisible?[...amounts,'cogsMinor','grossProfitMinor'] as (keyof DailySalesRow)[]:amounts;
 return <>
  <div className="page-title"><div><h1>{period==='week'?'Weekly Sales':period==='month'?'Monthly Sales':'Daily Sales'}</h1><p>Invoice and return activity by official closing day or Pakistan calendar date</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const saved=await window.pharmacy.dailySalesExport({...applied,format});if(saved.saved)setNotice(`${format.toUpperCase()} ${period==='week'?'weekly':period==='month'?'monthly':'daily'} sales saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Filters</h2>
   <form onSubmit={run}>
    <div className="closing-form"><label>Day grouping<select value={draft.dayMode} onChange={e=>setDraft({...draft,dayMode:e.target.value as 'official'|'calendar'})}><option value="official">Official closing day</option><option value="calendar">Pakistan calendar date</option></select></label><label>Range<select value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
     {draft.range==='custom'&&<><label>From<input aria-label="Daily sales from date" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<input aria-label="Daily sales to date" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
     {field('product','Product name or SKU')}{field('category','Category')}{field('brand','Brand / manufacturer')}{field('supplier','Recorded batch supplier')}
     {field('customer','Customer name or phone')}{field('cashier','Cashier')}
     <label>Payment method<select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value})}><option value="">All</option>{['cash','card','digital','credit'].map(value=><option value={value} key={value}>{value}</option>)}</select></label>
    </div><button className="primary">Run report</button>
   </form>
   <small>Official day follows the pharmacy close, even after midnight. Older entries without a matching official day use Pakistan calendar date. Filters select whole invoices and their related returns; category and brand use current product details.</small>
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
  <section className="panel"><h2>{period==='week'?'Weekly':period==='month'?'Monthly':'Daily'} totals</h2>
   {summary&&<><p>{dateLabel(summary.range.from)} – {dateLabel(summary.range.to)}</p>
    <div className="dashboard-grid"><div><table><tbody>{cols?.map(key=><tr key={key}><th>{labels[key]}</th><td className="number">{moneyCell(summary.totals[key] as number|null)}</td></tr>)}</tbody></table></div>
    <div><p>Sales: {summary.totals.saleCount} · Returns: {summary.totals.returnCount}</p><p>Settlements after a sale are outside Daily Sales revenue.</p></div></div>
    {summary.days.length?<table><thead><tr><th>{period==='week'?'Week starting Monday':period==='month'?'Month starting':'Day'}</th><th>Sales</th><th>Returns</th><th className="number">Net sales</th><th className="number">Net GST</th><th className="number">Net ex GST</th>{summary.costVisible&&<th className="number">Gross profit</th>}</tr></thead>
     <tbody>{summary.days.map(row=><tr key={row.day}><td>{dateLabel(row.day)}</td><td>{row.saleCount}</td><td>{row.returnCount}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td><td className="number">{money(row.netExGstMinor)}</td>{summary.costVisible&&<td className="number">{money(row.grossProfitMinor)}</td>}</tr>)}</tbody></table>:<p>No daily sales or returns match these filters.</p>}</>}
   {!summary&&!busy&&!error&&<p>Run the report to view daily totals.</p>}
  </section>
  <section className="panel"><h2>Invoice and return detail</h2>
   {entries?.items.length?<table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Customer</th><th>Cashier</th><th>Method</th><th className="number">Net incl GST</th><th className="number">GST</th>{summary?.costVisible&&<th className="number">Gross profit</th>}</tr></thead>
    <tbody>{entries.items.map(row=><tr key={`${row.kind}-${row.id}`}><td>{dateLabel(row.occurred_at||row.day)}</td><td>{row.kind}</td><td>{row.reference}</td><td>{row.customer||'Walk-in'}</td><td>{row.cashier||'Unknown'}</td><td>{row.method}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td>{summary?.costVisible&&<td className="number">{money(row.grossProfitMinor)}</td>}</tr>)}</tbody></table>:<p>No invoice or return entries on this page.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>
}
