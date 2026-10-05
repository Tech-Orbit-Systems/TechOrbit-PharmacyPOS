import {useEffect,useState} from 'react';
import type {OperationalSettings as Values} from './contracts';

const numeric: (keyof Values)[] = ['defaultGstBasisPoints','nearExpiryWarningDays','stockAlertThreshold','receiptPaperWidthMm','backupRetentionDays','closingVarianceToleranceMinor','sixMonthCycleStartMonth'];
export function OperationalSettings(){
  const [values,setValues]=useState<Values|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [backup,setBackup]=useState<Awaited<ReturnType<typeof window.pharmacy.backupStatus>>|null>(null),[backupError,setBackupError]=useState('');
  const [backups,setBackups]=useState<Awaited<ReturnType<typeof window.pharmacy.backupList>>>([]),[selectedBackup,setSelectedBackup]=useState(''),[restoreReason,setRestoreReason]=useState(''),[restoreConfirm,setRestoreConfirm]=useState(''),[backupBusy,setBackupBusy]=useState(false);
  const refreshBackup=()=>Promise.all([window.pharmacy.backupStatus(),window.pharmacy.backupList()]).then(([health,list])=>{setBackup(health);setBackups(list);setSelectedBackup(old=>list.some(item=>item.name===old&&item.valid)?old:(list.find(item=>item.valid)?.name||''));setBackupError('')}).catch(e=>setBackupError((e as Error).message));
  useEffect(()=>{let live=true;window.pharmacy.settingsRead().then(v=>{if(live)setValues(v)}).catch(e=>{if(live)setError((e as Error).message)});void refreshBackup();return()=>{live=false}},[]);
  const change=<K extends keyof Values>(key:K,value:Values[K])=>setValues(old=>old?{...old,[key]:value}:old);
  const profile=(key:keyof Values['receiptProfile'],value:string)=>setValues(old=>old?{...old,receiptProfile:{...old.receiptProfile,[key]:value}}:old);
  const text=(key:keyof Values,label:string,maxLength=120)=> <label>{label}<input value={String(values?.[key]??'')} maxLength={maxLength} onChange={e=>change(key,e.target.value as Values[typeof key])}/></label>;
  const number=(key:keyof Values,label:string,min:number,max:number,step=1)=> <label>{label}<input type="number" min={min} max={max} step={step} value={key==='defaultGstBasisPoints'?Number(values?.defaultGstBasisPoints||0)/100:key==='closingVarianceToleranceMinor'?Number(values?.closingVarianceToleranceMinor||0)/100:String(values?.[key]??'')} onChange={e=>change(key,(['defaultGstBasisPoints','closingVarianceToleranceMinor'].includes(key)?Math.round(Number(e.target.value)*100):Number(e.target.value)) as Values[typeof key])}/></label>;
  const receipt=(key:keyof Values['receiptProfile'],label:string,maxLength:number)=> <label>{label}<input value={values?.receiptProfile[key]??''} maxLength={maxLength} required={key==='pharmacyName'} onChange={e=>profile(key,e.target.value)}/></label>;
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(!values||busy)return;setBusy(true);setError('');setNotice('');
    try{
      if(numeric.some(key=>!Number.isSafeInteger(values[key]) || Number(values[key])<0))throw Error('Enter valid whole-number settings');
      const saved=await window.pharmacy.settingsSave(values);setValues(saved);window.dispatchEvent(new Event('techorbit:settings-saved'));setNotice('Operational settings saved and audited.');void refreshBackup();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const createBackup=async()=>{setBackupBusy(true);setError('');setNotice('');try{const created=await window.pharmacy.backupCreate();setNotice('Verified backup created.');await refreshBackup();setSelectedBackup(created.file)}catch(e){setError((e as Error).message)}finally{setBackupBusy(false)}};
  const restoreBackup=async()=>{if(!selectedBackup||restoreConfirm!=='RESTORE'||backupBusy)return;setBackupBusy(true);setError('');setNotice('');try{await window.pharmacy.backupRestore({name:selectedBackup,reason:restoreReason});window.dispatchEvent(new Event('techorbit:database-restored'))}catch(e){setError((e as Error).message);setBackupBusy(false)}};
  if(!values)return <section className="panel"><h2>Operational settings</h2><p role={error?'alert':'status'}>{error||'Loading settings…'}</p></section>;
  return <form className="operational-settings" onSubmit={save}>
    <section className="panel"><h2>Pharmacy and receipt</h2><div className="settings-fields">
      {receipt('pharmacyName','Pharmacy name',120)}{receipt('address','Address',240)}{receipt('phone','Contact number',40)}
      {receipt('taxRegistration','NTN',40)}{receipt('strn','STRN',40)}{receipt('footer','Receipt footer',240)}
      {text('invoicePrefix','Invoice prefix',12)}{text('receiptPrinterName','Windows printer name',120)}
      <label>Receipt paper width<select value={values.receiptPaperWidthMm} onChange={e=>change('receiptPaperWidthMm',Number(e.target.value) as 58|80)}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></label>
    </div><small>Printer selection and physical output will be verified during hardware acceptance.</small></section>
    <section className="panel"><h2>Product and counter defaults</h2><div className="settings-fields">
      {number('defaultGstBasisPoints','Default GST for new taxable products (%)',0,100,0.01)}
      {number('nearExpiryWarningDays','Near-expiry warning (days)',0,365)}
      {number('stockAlertThreshold','Default low-stock alert (base units)',0,1000000)}
      <label>Preferred sale unit<select value={values.defaultSaleUnit} onChange={e=>change('defaultSaleUnit',e.target.value as Values['defaultSaleUnit'])}><option value="product">Product default</option><option value="base">Base unit</option><option value="strip">Strip if configured</option><option value="box">Box if configured</option></select></label>
      <label>Default payment method<select value={values.defaultPaymentMethod} onChange={e=>change('defaultPaymentMethod',e.target.value as Values['defaultPaymentMethod'])}><option value="cash">Cash</option><option value="card">Card</option><option value="digital">Digital</option></select></label>
    </div><small>Existing product prices, units and tax are never rewritten by defaults.</small></section>
    <section className="panel"><h2>Closing rules</h2><div className="settings-fields">
      {number('closingVarianceToleranceMinor','Cash variance tolerance (Rs)',0,10000,0.01)}
      {number('sixMonthCycleStartMonth','Six-month cycle start month',1,12)}
    </div></section>
    <section className="panel"><h2>Backup preferences</h2><div className="settings-fields">
      <label>Daily backup time<input type="time" value={values.backupScheduleTime} onChange={e=>change('backupScheduleTime',e.target.value)}/></label>
      {number('backupRetentionDays','Keep backups (days)',1,365)}
    </div><small>Local SQLite backup runs daily and catches up after a missed schedule. Restore controls are tracked under P067. Keep backup files private and copy them off-device using an approved secure process.</small>
    <div role="status">{backup ? <><p>Last successful backup: {backup.lastSuccess ? `${backup.lastSuccess.at} (${backup.lastSuccess.file})` : 'None yet'}</p><p>Last failure: {backup.lastFailure ? `${backup.lastFailure.at} — ${backup.lastFailure.message}` : 'None'}</p><p>Free backup space: {backup.freeBytes == null ? 'Unavailable' : `${Math.floor(backup.freeBytes/1024/1024)} MB`}</p><p>{backup.running?'Backup running':'Backup idle'}</p></> : <p>{backupError || 'Loading backup health…'}</p>}</div><div className="toolbar"><button type="button" onClick={refreshBackup}>Refresh backup health</button><button type="button" disabled={backupBusy} onClick={createBackup}>{backupBusy?'Working…':'Create verified backup now'}</button></div>
    <h3>Restore a backup</h3><p>Restore signs everyone out and preserves the current database as a safety copy. Invalid, corrupt or newer-version backups cannot be selected.</p><div className="settings-fields">
      <label>Exact backup<select aria-label="Exact backup" value={selectedBackup} onChange={e=>setSelectedBackup(e.target.value)}><option value="">Choose backup</option>{backups.map(item=><option key={item.name} value={item.name} disabled={!item.valid}>{item.name} · {item.valid?(item.hasConfiguration?'verified + configuration':'verified'):`invalid: ${item.error}`}</option>)}</select></label>
      <label>Restore reason<input value={restoreReason} maxLength={240} onChange={e=>setRestoreReason(e.target.value)} placeholder="Why is this restore required?"/></label>
      <label>Type RESTORE to confirm<input value={restoreConfirm} onChange={e=>setRestoreConfirm(e.target.value)} autoComplete="off"/></label>
    </div><button className="danger" type="button" disabled={backupBusy||!selectedBackup||restoreReason.trim().length<10||restoreConfirm!=='RESTORE'} onClick={restoreBackup}>Restore selected backup</button></section>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save operational settings'}</button>
  </form>;
}
