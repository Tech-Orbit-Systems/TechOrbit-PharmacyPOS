const {rangeFor}=require('./ranges.cjs');
const exportsTable=require('./tabular-report-exports.cjs');
const pakistanTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function instant(raw){return new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z')}
function safeText(raw,entity,options={}){
 if(!raw)return '';
 if(/customer|sale|receivable|prescription/i.test(entity)&&!options.customerVisible)return '[Protected customer reason]';
 return String(raw).slice(0,500)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[Redacted email]')
  .replace(/(?<![\w])(?:\+?92|0)?[0-9][0-9\s()-]{6,17}[0-9](?![\w])/g,'[Redacted phone]')
  .replace(/\b(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|(?:password|token|secret)\s*[:=]\s*\S+)\b/gi,'[Redacted credential]');
}
function safePayload(raw,entity,options){
 if(!raw)return '';
 if(/user|auth|session|setting|config|backup/i.test(entity))return '[Protected configuration/authentication payload]';
 if(raw.length>100000)return '[Large payload omitted]';
 let parsed;try{parsed=JSON.parse(raw)}catch{return '[Unreadable saved payload]'}
 if(!parsed||typeof parsed!=='object')return '[Unstructured payload omitted]';
 const sanitize=(value,depth=0)=>{
  if(depth>8)return '[Nested value omitted]';
  if(Array.isArray(value))return value.slice(0,100).map(x=>sanitize(x,depth+1)).concat(value.length>100?['[Additional items omitted]']:[]);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>{
   const sensitive=/password|passphrase|secret|token|jwt|bearer|authorization|hash|salt|credential|pin|key|session|private|phone|address|email|doctor|prescription|idempotency/i.test(key)||(/(?:customer|patient)/i.test(key)&&/name/i.test(key)&&!options.customerVisible)||(/customer/i.test(entity)&&/name/i.test(key)&&!options.customerVisible);
   const financial=/amount|balance|total|paid|cash|gst|price|cost|cogs|profit|margin|discount|net|variance|saving|expense/i.test(key)&&!options.costVisible;
   return [key,sensitive||financial?'[Redacted]':sanitize(v,depth+1)];
  }));
  return typeof value==='string'?safeText(value,'',options):value;
 };
 return JSON.stringify(sanitize(parsed));
}
function auditSummary(db,input={},options={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose valid audit filters');
 const range=rangeFor(input,options.now||new Date()),clauses=['julianday(a.occurred_at)>=julianday(?)','julianday(a.occurred_at)<julianday(?)'],params=[range.start,range.end];
 for(const [key,column] of Object.entries({actor:"COALESCE(u.display_name,'Not recorded')",role:"COALESCE(a.role_code,ac.role_code,'Not recorded')",action:'a.action',entity:'a.entity_type',entityId:"COALESCE(a.entity_id,'')",device:"COALESCE(a.device_id,'')",reason:"COALESCE(a.reason,ac.reason,'')"})){
  const value=input[key];if(value!=null&&(typeof value!=='string'||value.length>100))throw Error('Choose valid audit filters');
  if(value?.trim()){clauses.push(`instr(lower(${column}),lower(?))>0`);params.push(value.trim())}
 }
 const rows=db.prepare(`SELECT a.id,a.occurred_at,a.user_id,u.display_name actor,COALESCE(a.role_code,ac.role_code) role_code,a.action,a.entity_type,a.entity_id,COALESCE(a.reason,ac.reason) reason,a.device_id,a.previous_json,a.new_json FROM AuditLog a LEFT JOIN Users u ON u.id=a.user_id LEFT JOIN AuditEventContext ac ON ac.audit_id=a.id WHERE ${clauses.join(' AND ')} ORDER BY julianday(a.occurred_at) DESC,a.id DESC LIMIT 10001`).all(...params);
 if(rows.length>10000)throw Error('Audit report exceeds 10,000 events; narrow dates or filters');
 const items=rows.map(x=>({id:x.id,occurredAt:x.occurred_at,occurredAtPk:pakistanTime.format(instant(x.occurred_at)),userId:x.user_id,actor:x.actor||'Not recorded',role:x.role_code||'Not recorded',action:x.action,entity:x.entity_type,entityId:x.entity_id||'',reason:safeText(x.reason,x.entity_type,options),device:x.device_id||'Not recorded',previousValue:safePayload(x.previous_json,x.entity_type,options),newValue:safePayload(x.new_json,x.entity_type,options)}));
 const actions=[...new Set(items.map(x=>x.action))].map(action=>({action,count:items.filter(x=>x.action===action).length}));
 const totals={eventCount:items.length,actorCount:new Set(items.map(x=>x.userId).filter(x=>x!=null)).size,actionCount:actions.length};
 if(actions.reduce((sum,x)=>sum+x.count,0)!==totals.eventCount)throw Error('Audit event counts do not reconcile');
 return {range:{from:range.from,to:range.to},items,actions,totals,scope:'Append-only audit events show both UTC instant and Pakistan local time. Historical role and missing attribution remain explicit. Reasons and previous/new values are redacted for credentials, contact details, prescription and configuration data; financial values require cost access. Oversized/deep payloads are omitted or truncated.'};
}
function auditEntries(db,input={},options={}){
 const r=auditSummary(db,input,options),page=Number(input.page??1),pageSize=Number(input.pageSize??25);
 if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Choose a valid report page');
 return {page,pageSize,hasMore:r.items.length>page*pageSize,items:r.items.slice((page-1)*pageSize,page*pageSize)};
}
function table(db,input,options){const r=auditSummary(db,input,options);return {title:'Audit Log Report',metadata:[['Dates',`${r.range.from} to ${r.range.to}`],['Scope',r.scope]],headers:['Audit ID','UTC instant','Pakistan time','User ID','Recorded by','Recorded role','Action','Record type','Record ID','Reason (sanitized)','Device','Previous value (sanitized)','New value (sanitized)'],rows:r.items.map(x=>[x.id,x.occurredAt,x.occurredAtPk,x.userId,x.actor,x.role,x.action,x.entity,x.entityId,x.reason,x.device,x.previousValue,x.newValue]),totals:[['Event count',r.totals.eventCount],['Attributed users',r.totals.actorCount],['Action types',r.totals.actionCount],...r.actions.map(x=>[x.action,x.count])]};}
module.exports={auditSummary,auditEntries,auditCsv:(db,input,options)=>exportsTable.csvReport(table(db,input,options)),auditXlsx:(db,input,options)=>exportsTable.xlsxReport(table(db,input,options)),auditPdf:(db,input,options)=>exportsTable.pdfReport(table(db,input,options))};
