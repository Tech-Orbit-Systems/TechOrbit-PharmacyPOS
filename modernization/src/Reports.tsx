import {useEffect,useState} from 'react';
import type {ProfitLossReport,ReportEntries} from './contracts';
import {money,dateLabel} from './shared';
import {DailySales} from './DailySales';
import {SalesByMedicine} from './SalesByMedicine';
import {CustomerReturnReport} from './CustomerReturnReport';
import {SupplierReturnReport} from './SupplierReturnReport';
import {PurchaseReport} from './PurchaseReport';
import {SupplierPurchaseReport} from './SupplierPurchaseReport';
import {BonusStockReport} from './BonusStockReport';
import {LowStockReport} from './LowStockReport';
import {ExpiryReport} from './ExpiryReport';
import {BatchStockReport} from './BatchStockReport';
import {StockMovementReport} from './StockMovementReport';
import {AdjustmentReport} from './AdjustmentReport';
import {AccountBalanceReport} from './AccountBalanceReport';
import {StockValuationReport} from './StockValuationReport';

function ProfitLoss(){
 const [range,setRange]=useState('1m'),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [page,setPage]=useState(1),[summary,setSummary]=useState<ProfitLossReport|null>(null),[entries,setEntries]=useState<ReportEntries|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(range==='custom'&&(!from||!to))return;
  let active=true;setBusy(true);setError('');
  const input={range,from,to};
  Promise.all([window.pharmacy.reportProfitLoss(input),window.pharmacy.reportEntries({...input,page})])
   .then(([a,b])=>{if(active){setSummary(a);setEntries(b)}})
   .catch(e=>{if(active){setSummary(null);setEntries(null);setError((e as Error).message)}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[range,from,to,page]);
 const changeRange=(value:string)=>{setRange(value);setPage(1)};
 const changeDate=(value:string,which:'from'|'to')=>{which==='from'?setFrom(value):setTo(value);setPage(1)};
 return <>
  <div className="page-title"><div><h1>Reports</h1><p>Accrual profit and loss · Pakistan dates</p></div>
   {(['csv','xlsx','pdf'] as const).map(format=><button key={format} disabled={busy||!summary} onClick={async()=>{try{setError('');const result=await window.pharmacy.reportExport({range,from,to,format});if(result.saved)setNotice(`${format.toUpperCase()} report saved.`)}catch(e){setError((e as Error).message)}}}>Export {format.toUpperCase()}</button>)}
  </div>
  <section className="panel"><h2>Profit and loss</h2>
   <div className="segmented" aria-label="Report date range">{[['7d','7 Days'],['1m','1 Month'],['6m','6 Months'],['1y','1 Year'],['custom','Custom']].map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>changeRange(value)}>{label}</button>)}</div>
   {range==='custom'&&<div className="custom-dates"><label>From<input type="date" aria-label="Report from date" value={from} onChange={e=>changeDate(e.target.value,'from')}/></label><label>To<input type="date" aria-label="Report to date" value={to} onChange={e=>changeDate(e.target.value,'to')}/></label></div>}
   {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {summary&&<><p>{dateLabel(summary.range.from)} – {dateLabel(summary.range.to)}</p><table><tbody>
    {[
     ['Listed sales before discounts (ex GST)',summary.listedGrossMinor],['Discounts',-summary.salesDiscountMinor],
     ['GST charged',summary.salesGstMinor],['Invoice rounding',summary.salesRoundingMinor],
     ['Invoiced sales including GST',summary.salesGrossMinor],['Sales GST',-summary.salesGstMinor],['Sales excluding GST',summary.salesExGstMinor],
     ['Customer returns excluding GST',-summary.returnsExGstMinor],['Net revenue excluding GST',summary.netRevenueMinor],
     ['Sold batch cost',-summary.soldCogsMinor],['Returned batch cost',summary.returnedCogsMinor],['Net cost of goods',-summary.cogsMinor],
     ['Gross profit',summary.grossProfitMinor],['Incurred expenses',-summary.expensesMinor],['Operating profit',summary.operatingProfitMinor]
    ].map(([label,value])=><tr key={label}><th>{label}</th><td className="number">PKR {money(value as number)}</td></tr>)}
   </tbody></table><small>Purchases stay in inventory until sold. Customer, supplier and vendor settlements do not create new income or expenses. Savings transfers do not change profit.</small></>}
   {!summary&&!busy&&!error&&<p>Choose dates to view the report.</p>}
  </section>
  <section className="panel"><h2>Report entries</h2><p>Sales, returns and incurred expenses for this period.</p>
   {entries?.items.length?<table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="number">Gross</th><th className="number">GST</th><th className="number">COGS</th><th className="number">P&L effect</th></tr></thead><tbody>{entries.items.map(row=><tr key={`${row.kind}-${row.id}`}><td>{dateLabel(row.occurred_at)}</td><td>{row.kind}</td><td>{row.reference}</td><td className="number">{money(row.gross_minor)}</td><td className="number">{money(row.gst_minor)}</td><td className="number">{money(row.cogs_minor)}</td><td className="number">{money(row.contribution_minor)}</td></tr>)}</tbody></table>:<p>No report entries for these dates.</p>}
   <div className="segmented"><button disabled={page===1||busy} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!entries?.hasMore||busy} onClick={()=>setPage(page+1)}>Next</button></div>
  </section>
 </>
}
export function Reports({canViewProfit,canViewSalesReport,canViewInventory,canViewDues}:{canViewProfit:boolean;canViewSalesReport:boolean;canViewInventory:boolean;canViewDues:boolean}){
 const [tab,setTab]=useState<'pnl'|'daily'|'weekly'|'monthly'|'medicine'|'generic'|'category'|'brand'|'cashier'|'method'|'tax'|'gst'|'discount'|'customerReturn'|'supplierReturn'|'purchase'|'supplierPurchase'|'bonusStock'|'lowStock'|'expiry'|'batchStock'|'stockMovement'|'adjustment'|'stockValuation'|'customerBalance'|'supplierBalance'>(canViewProfit?'pnl':canViewSalesReport?'daily':canViewInventory?'lowStock':'customerBalance');
 return <><div className="segmented" role="tablist" aria-label="Report type">
  {canViewProfit&&<button role="tab" aria-selected={tab==='pnl'} onClick={()=>setTab('pnl')}>Profit and Loss</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='daily'} onClick={()=>setTab('daily')}>Daily Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='weekly'} onClick={()=>setTab('weekly')}>Weekly Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='monthly'} onClick={()=>setTab('monthly')}>Monthly Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='medicine'} onClick={()=>setTab('medicine')}>Sales by Medicine</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='generic'} onClick={()=>setTab('generic')}>Sales by Generic</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='category'} onClick={()=>setTab('category')}>Sales by Category</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='brand'} onClick={()=>setTab('brand')}>Sales by Brand/Manufacturer</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='cashier'} onClick={()=>setTab('cashier')}>Sales by Cashier</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='method'} onClick={()=>setTab('method')}>Sales by Payment Method</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='tax'} onClick={()=>setTab('tax')}>Taxable vs Exempt Sales</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='gst'} onClick={()=>setTab('gst')}>GST Report</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='discount'} onClick={()=>setTab('discount')}>Discount Report</button>}
  {canViewSalesReport&&<button role="tab" aria-selected={tab==='customerReturn'} onClick={()=>setTab('customerReturn')}>Customer Return Report</button>}
  {canViewProfit&&<button role="tab" aria-selected={tab==='supplierReturn'} onClick={()=>setTab('supplierReturn')}>Supplier Return Report</button>}
  {canViewProfit&&<button role="tab" aria-selected={tab==='purchase'} onClick={()=>setTab('purchase')}>Purchase Report</button>}
  {canViewProfit&&<button role="tab" aria-selected={tab==='supplierPurchase'} onClick={()=>setTab('supplierPurchase')}>Supplier Purchase Report</button>}
  {canViewProfit&&<button role="tab" aria-selected={tab==='bonusStock'} onClick={()=>setTab('bonusStock')}>Bonus Stock/Scheme Report</button>}
  {canViewInventory&&<button role="tab" aria-selected={tab==='lowStock'} onClick={()=>setTab('lowStock')}>Low Stock Report</button>}
  {canViewInventory&&<button role="tab" aria-selected={tab==='expiry'} onClick={()=>setTab('expiry')}>Expiry Report</button>}
  {canViewInventory&&<button role="tab" aria-selected={tab==='batchStock'} onClick={()=>setTab('batchStock')}>Batch Stock Report</button>}
  {canViewInventory&&<button role="tab" aria-selected={tab==='stockMovement'} onClick={()=>setTab('stockMovement')}>Stock Movement Report</button>}
  {canViewInventory&&<button role="tab" aria-selected={tab==='adjustment'} onClick={()=>setTab('adjustment')}>Stock Adjustment/Disposal Report</button>}
  {canViewInventory&&canViewProfit&&<button role="tab" aria-selected={tab==='stockValuation'} onClick={()=>setTab('stockValuation')}>Stock Valuation Report</button>}
  {canViewDues&&<button role="tab" aria-selected={tab==='customerBalance'} onClick={()=>setTab('customerBalance')}>Customer Receivable Report</button>}
  {canViewDues&&<button role="tab" aria-selected={tab==='supplierBalance'} onClick={()=>setTab('supplierBalance')}>Supplier Payable Report</button>}
 </div>{tab==='pnl'&&canViewProfit?<ProfitLoss/>:tab==='customerReturn'?<CustomerReturnReport/>:tab==='supplierReturn'&&canViewProfit?<SupplierReturnReport/>:tab==='purchase'&&canViewProfit?<PurchaseReport/>:tab==='supplierPurchase'&&canViewProfit?<SupplierPurchaseReport/>:tab==='bonusStock'&&canViewProfit?<BonusStockReport/>:tab==='lowStock'&&canViewInventory?<LowStockReport/>:tab==='expiry'&&canViewInventory?<ExpiryReport/>:tab==='batchStock'&&canViewInventory?<BatchStockReport/>:tab==='stockMovement'&&canViewInventory?<StockMovementReport/>:tab==='adjustment'&&canViewInventory?<AdjustmentReport/>:tab==='stockValuation'&&canViewInventory&&canViewProfit?<StockValuationReport/>:tab==='supplierBalance'&&canViewDues?<AccountBalanceReport key='supplier' type='supplier'/>:tab==='customerBalance'&&canViewDues?<AccountBalanceReport key='customer'/>:tab==='medicine'||tab==='generic'||tab==='category'||tab==='brand'||tab==='cashier'||tab==='method'||tab==='tax'||tab==='gst'||tab==='discount'?<SalesByMedicine key={tab} groupBy={tab}/>:<DailySales key={tab} period={tab==='weekly'?'week':tab==='monthly'?'month':'day'}/>}</>
}
