import {useEffect,useState} from 'react';
import type {AuditReportInput,AuditReportSummary,AuditReportRow} from './contracts';
function savedValue(raw:string){
 if(!raw)return 'Not saved';
 try{const value=JSON.parse(raw);return Object.entries(value).map(([key,val])=>`${key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')}: ${typeof val==='object'?JSON.stringify(val):String(val)}`).join('\n')}catch{return raw}
}
export function AuditReport(){
 const initial:AuditReportInput={range:'1m'};
 const [draft,setDraft]=useState(initial),[applied,setApplied]=useState(initial),[page,setPage]=useState(1);
 const [summary,setSummary]=useState<AuditReportSummary|null>(null),[entries,setEntries]=useState<{hasMore:boolean;items:AuditReportRow[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');Promise.all([window.pharmacy.auditSummary(applied),window.pharmacy.auditEntries({...applied,page})]).then(([s,e])=>{if(active){setSummary(s);setEntries(e)}}).catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[applied,page]);
 return <>
  <div className="page-title"><h1>Audit Log Report</h1>{(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const r=await window.pharmacy.auditExport({...applied,format});if(r.saved)setNotice(`${format.toUpperCase()} audit report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}</div>
  <section className="panel"><h2>Filters</h2><form onSubmit={e=>{e.preventDefault();setPage(1);setNotice('');setApplied({...draft})}}><div className="closing-form">
   <label>Audit dates<select aria-label="Audit dates" value={draft.range} onChange={e=>setDraft({...draft,range:e.target.value})}>{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   {draft.range==='custom'&&<><label>Audit from<input type="date" value={draft.from||''} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>Audit to<input type="date" value={draft.to||''} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
   {([['actor','Audit user'],['role','Recorded role'],['action','Audit action'],['entity','Record type'],['entityId','Record ID'],['device','Device'],['reason','Audit reason']] as const).map(([key,label])=><label key={key}>{label}<input maxLength={100} value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
   </div><button className="primary">Run report</button></form><small>{summary?.scope}</small>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>
  <section className="panel"><h2>Audit totals</h2>{summary&&<><p>Events: {summary.totals.eventCount} | Attributed users: {summary.totals.actorCount} | Action types: {summary.totals.actionCount}</p>{summary.actions.map(x=><p key={x.action}>{x.action}: {x.count}</p>)}</>}</section>
  <section className="panel"><h2>Saved audit events</h2>{entries?.items.length?<table><thead><tr><th>ID / time</th><th>User / role</th><th>Action</th><th>Reference</th><th>Reason</th><th>Device</th><th>Previous / new value</th></tr></thead><tbody>{entries.items.map(x=><tr key={x.id}><td>#{x.id}<br/>PK {x.occurredAtPk}<br/><small>UTC {x.occurredAt}</small></td><td>{x.actor}<br/>{x.role}</td><td>{x.action}</td><td>{x.entity} #{x.entityId}</td><td>{x.reason||'Not recorded'}</td><td>{x.device}</td><td><details><summary>View changes</summary><b>Previous value</b><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:320}}>{savedValue(x.previousValue)}</pre><b>New value</b><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:320}}>{savedValue(x.newValue)}</pre></details></td></tr>)}</tbody></table>:<p>No audit events match these filters.</p>}<div className="segmented"><button disabled={busy||page===1} onClick={()=>setPage(page-1)}><span>Previous</span></button><span>Page {page}</span><button disabled={busy||!entries?.hasMore} onClick={()=>setPage(page+1)}>Next</button></div></section>
 </>;
}
