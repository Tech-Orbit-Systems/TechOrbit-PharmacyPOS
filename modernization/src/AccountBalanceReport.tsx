import {useEffect,useState} from 'react';
import type {AccountBalanceInput,AccountBalanceSummary,AccountBalanceRow} from './contracts';
import {money} from './shared';

export function AccountBalanceReport({type='customer'}:{type?:'customer'|'supplier'|'vendor'}){
 const vendor=type==='vendor',supplier=type==='supplier',title=vendor?'Vendor Payable Report':supplier?'Supplier Payable Report':'Customer Receivable Report';
 const summaryApi=vendor?window.pharmacy.vendorBalanceSummary:supplier?window.pharmacy.supplierBalanceSummary:window.pharmacy.customerBalanceSummary,entriesApi=vendor?window.pharmacy.vendorBalanceEntries:supplier?window.pharmacy.supplierBalanceEntries:window.pharmacy.customerBalanceEntries,exportApi=vendor?window.pharmacy.vendorBalanceExport:supplier?window.pharmacy.supplierBalanceExport:window.pharmacy.customerBalanceExport;
 const [draft,setDraft]=useState<AccountBalanceInput>({status:'open'}),[applied,setApplied]=useState<AccountBalanceInput>({status:'open'}),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<AccountBalanceSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:AccountBalanceRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');
  Promise.all([summaryApi(applied),entriesApi({...applied,page})])
   .then(([s,e])=>{if(active){setSummary(s);setEntries(e)}}).catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[applied,page,type]);
 return <>
  <div className="page-title"><h1>{title}</h1>{(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const result=await exportApi({...applied,format});if(result.saved)setNotice(`${format.toUpperCase()} ${title.toLowerCase()} saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}</div>
  <section className="panel"><h2>Filters</h2><form onSubmit={e=>{e.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>{vendor?'Vendor name':supplier?'Supplier name':'Customer name'}<input maxLength={100} value={draft.party||''} onChange={e=>setDraft({...draft,party:e.target.value})}/></label>
   <label>Account reference<input maxLength={100} value={draft.reference||''} onChange={e=>setDraft({...draft,reference:e.target.value})}/></label>
   <label>Due from<input type="date" value={draft.dueFrom||''} onChange={e=>setDraft({...draft,dueFrom:e.target.value})}/></label>
   <label>Due to<input type="date" value={draft.dueTo||''} onChange={e=>setDraft({...draft,dueTo:e.target.value})}/></label>
   <label>Balance status<select aria-label="Balance status" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as AccountBalanceInput['status']})}><option value="open">Open</option><option value="all">All</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></label>
   </div><button className="primary">Run report</button></form><small>{summary?.scope}</small>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>
  <section className="panel"><h2>{vendor||supplier?'Payable totals':'Receivable totals'}</h2>{summary&&<><p>As of {summary.asOfDate} | Accounts: {summary.totals.accountCount} | Parties: {summary.totals.partyCount}</p><p>Original debt: PKR {money(summary.totals.originalMinor)} | Later payments: PKR {money(summary.totals.paymentsMinor)} | Return credits: PKR {money(summary.totals.creditMinor)}</p><p>Current balance: PKR {money(summary.totals.balanceMinor)} | Overdue: PKR {money(summary.totals.overdueMinor)}</p></>}</section>
  <section className="panel"><h2>Account detail</h2>{entries?.items.length?<table><thead><tr><th>{vendor?'Vendor':supplier?'Supplier':'Customer'}</th><th>Reference</th><th>Due date</th><th>Original debt</th><th>Later payments</th><th>Credits</th><th>Balance</th><th>Days overdue</th></tr></thead><tbody>{entries.items.map(row=><tr key={row.id}><td>{row.party}</td><td>{row.reference}</td><td>{row.dueDate||'Not recorded'}</td><td>{money(row.originalMinor)}</td><td>{money(row.paymentsMinor)}</td><td>{money(row.creditMinor)}</td><td>{money(row.balanceMinor)}</td><td>{row.daysOverdue}</td></tr>)}</tbody></table>:<p>No accounts match these filters.</p>}<div className="segmented"><button disabled={busy||page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={busy||!entries?.hasMore} onClick={()=>setPage(page+1)}>Next</button></div></section>
 </>;
}
