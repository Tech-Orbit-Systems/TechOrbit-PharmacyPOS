import {useEffect,useState} from 'react';
import {RefreshCw,WalletCards,ChartColumn} from 'lucide-react';
import type {Api} from './contracts';
import {dateLabel,money} from './shared';
type Shift=Awaited<ReturnType<Api['closingShiftPreview']>>;
type Period=Awaited<ReturnType<Api['closingPeriodPreview']>>;

export function Closing(){
  const [shift,setShift]=useState<Shift|null>(null),[period,setPeriod]=useState<Period|null>(null);
  const [error,setError]=useState(''),[periodNotice,setPeriodNotice]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{
    setBusy(true);setError('');
    try{
      const active=await window.pharmacy.shiftStatus();
      setShift(active?await window.pharmacy.closingShiftPreview({shiftId:active.id}):null);
      try{setPeriod(await window.pharmacy.closingPeriodPreview({}));setPeriodNotice('')}
      catch(e){setPeriod(null);setPeriodNotice((e as Error).message)}
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  useEffect(()=>{void load()},[]);
  return <section className="closing-page">
    <div className="page-title"><div><h1>Closing</h1><p>Cashier shift and six-month financial review.</p></div><button onClick={load} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    <section className="panel"><h2><WalletCards size={18}/> Current cashier shift</h2>
      {shift?<><p>Opened {dateLabel(shift.openedAt)} · {shift.deviceId}</p>
        <div className="closing-summary"><div><small>Opening cash</small><strong>{money(shift.openingCashMinor)}</strong></div><div><small>Expected cash</small><strong>{money(shift.expectedCashMinor)}</strong></div><div><small>Unattributed cash entries</small><strong>{shift.unattributedCashCount}</strong></div></div>
        <div className="account-table"><table><thead><tr><th>Method</th><th>Direction</th><th>Amount</th></tr></thead><tbody>{shift.movements.map((row,i)=><tr key={i}><td>{row.method}</td><td>{row.direction==='in'?'Received':'Paid'}</td><td className="number">{money(row.amount)}</td></tr>)}</tbody></table></div>
      </>:<p>No open shift for this cashier on this device.</p>}
    </section>
    {periodNotice&&<p className="error" role="status">{periodNotice}</p>}
    {period&&<section className="panel"><h2><ChartColumn size={18}/> Six-month review</h2><p>{period.periodStart} to {period.periodEnd} · As of {dateLabel(period.asOf)}</p>
      <div className="account-table"><table><thead><tr><th>Month</th><th>Net sales</th><th>GST</th><th>COGS</th><th>Gross profit</th><th>Expenses</th><th>Operating profit</th></tr></thead><tbody>{period.months.map(row=><tr key={row.month}><td>{row.month}</td><td className="number">{money(row.netSalesMinor)}</td><td className="number">{money(row.gstMinor)}</td><td className="number">{money(row.cogsMinor)}</td><td className="number">{money(row.grossProfitMinor)}</td><td className="number">{money(row.expensesMinor)}</td><td className="number">{money(row.operatingProfitMinor)}</td></tr>)}</tbody></table></div>
    </section>}
  </section>;
}
