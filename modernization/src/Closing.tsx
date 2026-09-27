import {useEffect,useState} from 'react';
import {RefreshCw,WalletCards,ChartColumn} from 'lucide-react';
import type {Api,ClosingDay,ClosingAccount} from './contracts';
import {dateLabel,money} from './shared';
type Shift=Awaited<ReturnType<Api['closingShiftPreview']>>;
type Period=Awaited<ReturnType<Api['closingPeriodPreview']>>;
const minor=(value:string)=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());if(!match)throw Error('Enter rupees with up to two decimals');const result=Number(match[2])*100+Number((match[3]||'').padEnd(2,'0'));if(!Number.isSafeInteger(result))throw Error('Amount is too large');return match[1]?-result:result};
const editable=(value:number|null|undefined)=>value==null?'':(value/100).toFixed(2);

export function Closing(){
  const [shift,setShift]=useState<Shift|null>(null),[period,setPeriod]=useState<Period|null>(null);
  const [day,setDay]=useState<ClosingDay|null>(null),[accounts,setAccounts]=useState<ClosingAccount[]>([]);
  const [manager,setManager]=useState(false),[handover,setHandover]=useState<{shiftId:number;countedCashMinor:number}|null>(null);
  const [counted,setCounted]=useState(''),[varianceReason,setVarianceReason]=useState(''),[forcedReason,setForcedReason]=useState('');
  const [opening,setOpening]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [tolerance,setTolerance]=useState('50.00'),[cycleMonth,setCycleMonth]=useState(1),[accountKind,setAccountKind]=useState<'bank'|'wallet'|'savings'>('bank'),[accountName,setAccountName]=useState('');
  const [allocation,setAllocation]=useState<Record<number,string>>({}),[actuals,setActuals]=useState<Record<number,string>>({}),[dayReason,setDayReason]=useState('');
  const [history,setHistory]=useState<Awaited<ReturnType<Api['closingDayHistory']>>>([]),[detail,setDetail]=useState<Awaited<ReturnType<Api['closingDayDetail']>>|null>(null);
  const [revisionCash,setRevisionCash]=useState(''),[revisionReason,setRevisionReason]=useState('');
  const [savingsAccount,setSavingsAccount]=useState(''),[savingsAmount,setSavingsAmount]=useState(''),[savingsReference,setSavingsReference]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[periodNotice,setPeriodNotice]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{
    setBusy(true);setError('');
    try{
      const active=await window.pharmacy.shiftStatus();
      setShift(active?await window.pharmacy.closingShiftPreview({shiftId:active.id}):null);
      if(active){const preview=await window.pharmacy.closingShiftPreview({shiftId:active.id});setCounted(editable(preview.expectedCashMinor));setHandover(null)}
      else {const prior=await window.pharmacy.closingHandover();setHandover(prior);setOpening(prior?editable(prior.countedCashMinor):'')}
      try{const config=await window.pharmacy.closingConfig({});setManager(true);setAccounts(config.accounts);setTolerance(editable(config.policy.varianceToleranceMinor));setCycleMonth(config.policy.sixMonthCycleStartMonth);
        try{const current=await window.pharmacy.closingDayPreview({});setDay(current);setActuals(Object.fromEntries(current.accounts.map(row=>[row.id,editable(row.expectedNetMinor)])))}catch{setDay(null)}
        setHistory(await window.pharmacy.closingDayHistory({}));
      }catch{setManager(false);setDay(null)}
      try{setPeriod(await window.pharmacy.closingPeriodPreview({}));setPeriodNotice('')}
      catch(e){setPeriod(null);setPeriodNotice((e as Error).message)}
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  useEffect(()=>{void load()},[]);
  const action=async(work:()=>Promise<unknown>,message:string)=>{setBusy(true);setError('');setNotice('');try{await work();setNotice(message);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  const viewHistory=async(id:number)=>{try{const saved=await window.pharmacy.closingDayDetail({businessDayId:id});setDetail(saved);setRevisionCash(editable(saved.current.cashCountedMinor));setActuals(Object.fromEntries(saved.current.accounts.map(row=>[row.id,editable(row.actualNetMinor)])));setError('')}catch(e){setError((e as Error).message)}};
  return <section className="closing-page">
    <div className="page-title"><div><h1>Closing</h1><p>Cashier shifts, official business day and pharmacy reporting cycle.</p></div><button onClick={load} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <section className="panel"><h2><WalletCards size={18}/> Current cashier shift</h2>
      {shift?<><p>Opened {dateLabel(shift.openedAt)} · {shift.deviceId}</p>
        <div className="closing-summary"><div><small>Opening cash</small><strong>{money(shift.openingCashMinor)}</strong></div><div><small>Expected cash</small><strong>{money(shift.expectedCashMinor)}</strong></div><div><small>Unattributed cash entries</small><strong>{shift.unattributedCashCount}</strong></div></div>
        <div className="account-table"><table><thead><tr><th>Method</th><th>Direction</th><th>Amount</th></tr></thead><tbody>{shift.movements.map((row,i)=><tr key={i}><td>{row.method}</td><td>{row.direction==='in'?'Received':'Paid'}</td><td className="number">{money(row.amount)}</td></tr>)}</tbody></table></div>
        <div className="closing-form"><label>Counted cash (Rs)<input value={counted} onChange={e=>setCounted(e.target.value)}/></label><label>Variance reason, if any<input value={varianceReason} onChange={e=>setVarianceReason(e.target.value)}/></label>
          {manager&&<label>Manager forced close reason, if closing another cashier's shift<input value={forcedReason} onChange={e=>setForcedReason(e.target.value)}/></label>}
          <button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingShiftClose({shiftId:shift.shiftId,countedCashMinor:minor(counted),varianceReason,forcedCloseReason:forcedReason}),'Shift closed.')}>Close shift</button></div>
      </>:<><p>No open shift for this cashier on this device.</p><div className="closing-form">{handover&&<p>Previous counted handover: {money(handover.countedCashMinor)}.</p>}
        <label>Opening cash (Rs)<input value={opening} onChange={e=>setOpening(e.target.value)}/></label>{handover&&<label className="closing-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I counted and accept the handover</label>}
        <button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingShiftOpen({openingCashMinor:minor(opening),handoverConfirmed:confirmed}),'Shift opened.')}>Open shift</button></div></>}
    </section>
    {manager&&<>
      <section className="panel"><h2>Official business day</h2>
        {day?<><p>Opened {dateLabel(day.openedAt)}. It stays open across midnight until official close.</p>
          <div className="closing-summary"><div><small>Expected cash</small><strong>{money(day.cashExpectedMinor)}</strong></div><div><small>Counted cash</small><strong>{day.cashCountedMinor===null?'Pending':money(day.cashCountedMinor)}</strong></div><div><small>Actual savings transfers</small><strong>{money(day.savingsTransferredMinor)}</strong></div></div>
          <p>{day.openShifts} open shifts · {day.unresolvedMovementCount} unresolved money movements</p>
          {!!day.shifts.length&&<div className="account-table"><table><thead><tr><th>Cashier</th><th>Opened</th><th>Status</th><th>Counted cash</th><th></th></tr></thead><tbody>{day.shifts.map(row=><tr key={row.id}><td>User #{row.user_id}</td><td>{dateLabel(row.opened_at)}</td><td>{row.status}</td><td>{row.counted_cash_minor==null?'Pending':money(row.counted_cash_minor)}</td><td>{row.status==='open'&&<button onClick={()=>void window.pharmacy.closingShiftPreview({shiftId:row.id}).then(preview=>{setShift(preview);setCounted(editable(preview.expectedCashMinor))}).catch(e=>setError((e as Error).message))}>Review shift</button>}</td></tr>)}</tbody></table></div>}
          {!!day.unresolvedMovements.length&&<div className="account-table"><table><thead><tr><th>Movement</th><th>Method</th><th>Amount</th><th>Account</th></tr></thead><tbody>{day.unresolvedMovements.map(row=><tr key={row.id}><td>#{row.id}</td><td>{row.method}</td><td>{money(row.amountMinor)}</td><td>{row.needsShift?'Shift ownership needs review':row.method==='cash'?'Cash ownership needs review':<><select aria-label={`Account for movement ${row.id}`} value={allocation[row.id]||''} onChange={e=>setAllocation({...allocation,[row.id]:e.target.value})}><option value="">Choose account</option>{accounts.filter(account=>account.active&&account.kind!=='savings'&&(row.method==='mobile_wallet'?account.kind==='wallet':['card','bank_transfer'].includes(row.method)?account.kind==='bank':true)).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select> <button disabled={busy||!allocation[row.id]} onClick={()=>void action(()=>window.pharmacy.closingAllocate({movementId:row.id,accountId:Number(allocation[row.id])}),'Movement allocated.')}>Assign</button></>}</td></tr>)}</tbody></table></div>}
          {!!day.accounts.length&&<div className="account-table"><table><thead><tr><th>Account</th><th>Received</th><th>Paid</th><th>Expected net</th><th>Actual statement net (Rs)</th></tr></thead><tbody>{day.accounts.map(row=><tr key={row.id}><td>{row.name}</td><td>{money(row.inMinor)}</td><td>{money(row.outMinor)}</td><td>{money(row.expectedNetMinor)}</td><td><input aria-label={`Actual statement net for ${row.name}`} value={actuals[row.id]||''} onChange={e=>setActuals({...actuals,[row.id]:e.target.value})}/></td></tr>)}</tbody></table></div>}
          <div className="closing-form"><label>Digital variance or closing reason<input value={dayReason} onChange={e=>setDayReason(e.target.value)}/></label><button disabled={busy||!!day.openShifts||!!day.unresolvedMovementCount} onClick={()=>void action(()=>window.pharmacy.closingDayClose({accountActuals:Object.fromEntries(day.accounts.map(row=>[row.id,minor(actuals[row.id]||'')])),reason:dayReason}),'Official business day closed.')}>Official daily close</button></div>
        </>:<p>No open business day. Opening a shift starts the next one.</p>}
      </section>
      <section className="panel"><h2>Pharmacy closing rules and accounts</h2>
        <div className="closing-form"><label>Cash variance tolerance (Rs)<input value={tolerance} onChange={e=>setTolerance(e.target.value)}/></label><label>Six-month cycle starts in<select value={cycleMonth} onChange={e=>setCycleMonth(Number(e.target.value))}>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((name,index)=><option key={name} value={index+1}>{name}</option>)}</select></label><button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingSavePolicy({varianceToleranceMinor:minor(tolerance),sixMonthCycleStartMonth:cycleMonth}),'Rules saved.')}>Save rules</button></div>
        <div className="account-table"><table><thead><tr><th>Type</th><th>Account</th><th>Status</th><th></th></tr></thead><tbody>{accounts.map(row=><tr key={row.id}><td>{row.kind}</td><td>{row.name}</td><td>{row.active?'Active':'Inactive'}</td><td><button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingSaveAccount({id:row.id,kind:row.kind,name:row.name,active:!row.active}),'Account updated.')}>{row.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table></div>
        <div className="closing-form"><label>New account type<select value={accountKind} onChange={e=>setAccountKind(e.target.value as 'bank'|'wallet'|'savings')}><option value="bank">Bank</option><option value="wallet">Wallet</option><option value="savings">Savings</option></select></label><label>Account name<input value={accountName} onChange={e=>setAccountName(e.target.value)}/></label><button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingSaveAccount({kind:accountKind,name:accountName,active:true}),'Account saved.')}>Add account</button></div>
        <h3>Record an actual savings transfer</h3><div className="closing-form"><label>Savings account<select value={savingsAccount} onChange={e=>setSavingsAccount(e.target.value)}><option value="">Choose account</option>{accounts.filter(row=>row.kind==='savings'&&row.active).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Amount transferred (Rs)<input value={savingsAmount} onChange={e=>setSavingsAmount(e.target.value)}/></label><label>Transfer reference<input value={savingsReference} onChange={e=>setSavingsReference(e.target.value)}/></label><button disabled={busy} onClick={()=>void action(()=>window.pharmacy.closingSavingsTransfer({accountId:Number(savingsAccount),amountMinor:minor(savingsAmount),reference:savingsReference}),'Actual savings transfer recorded.')}>Record transfer</button></div>
      </section>
      <section className="panel"><h2>Official closing history and revisions</h2>{history.length?<div className="account-table"><table><thead><tr><th>Started</th><th>Closed</th><th>Revisions</th><th></th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td>{dateLabel(row.opened_at)}</td><td>{dateLabel(row.closed_at)}</td><td>{row.revisionCount}</td><td><button onClick={()=>void viewHistory(row.id)}>View</button></td></tr>)}</tbody></table></div>:<p>No official close recorded yet.</p>}
        {detail&&<><p>Original counted cash: {money(detail.original.cashCountedMinor||0)} · Current: {money(detail.current.cashCountedMinor||0)}. Original snapshot and {detail.revisions.length} revisions are retained.</p>
          <div className="closing-form"><label>Revised counted cash (Rs)<input value={revisionCash} onChange={e=>setRevisionCash(e.target.value)}/></label>{detail.current.accounts.map(row=><label key={row.id}>Revised actual net for {row.name} (Rs)<input value={actuals[row.id]||''} onChange={e=>setActuals({...actuals,[row.id]:e.target.value})}/></label>)}<label>Revision reason<input value={revisionReason} onChange={e=>setRevisionReason(e.target.value)}/></label><button disabled={busy} onClick={()=>void action(async()=>{await window.pharmacy.closingDayRevise({businessDayId:detail.current.businessDayId,cashCountedMinor:minor(revisionCash),accountActuals:Object.fromEntries(detail.current.accounts.map(row=>[row.id,minor(actuals[row.id]||'')])),reason:revisionReason});await viewHistory(detail.current.businessDayId)},'Reasoned revision saved.')}>Save revision</button></div></>}
      </section>
    </>}
    {periodNotice&&<p className="error" role="status">{periodNotice}</p>}
    {period&&<section className="panel"><h2><ChartColumn size={18}/> Six-month review</h2><p>{period.periodStart} to {period.periodEnd} · As of {dateLabel(period.asOf)} · Cycle starts in month {period.cycleStartMonth}</p>
      <div className="account-table"><table><thead><tr><th>Month</th><th>Net sales</th><th>GST</th><th>COGS</th><th>Gross profit</th><th>Expenses</th><th>Operating profit</th><th>Actual savings transfers</th></tr></thead><tbody>{period.months.map(row=><tr key={row.month}><td>{row.month}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td><td className="number">{money(row.cogsMinor)}</td><td className="number">{money(row.grossProfitMinor)}</td><td className="number">{money(row.expensesMinor)}</td><td className="number">{money(row.operatingProfitMinor)}</td><td className="number">{money(row.savingsTransferredMinor)}</td></tr>)}</tbody></table></div>
    </section>}
  </section>;
}
