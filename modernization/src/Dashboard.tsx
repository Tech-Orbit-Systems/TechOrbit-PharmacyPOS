import { useEffect, useRef, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
  ReceiptText,
  Wallet,
  TriangleAlert,
  Clock,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import type { DashboardData } from "./contracts";
import { money, dateLabel, Dialog } from "./shared";
import { SalesChart } from "./SalesChart";
const ranges = [
  ["7d", "7 Days"],
  ["1m", "1 Month"],
  ["6m", "6 Months"],
  ["1y", "1 Year"],
  ["custom", "Custom"],
];
export function Dashboard({ onSale,onAccounts,onInventory,onReports,canViewProfit }: { onSale: () => void;onAccounts:()=>void;onInventory:()=>void;onReports:()=>void;canViewProfit:boolean }) {
  const [range, setRange] = useState("7d"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState<{ title: string; rows: any[] } | null>(null);
  const request = useRef(0);
  useEffect(() => {
    if (range === "custom" && (!from || !to)) return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    window.pharmacy
      .dashboard({ range, from, to })
      .then((result) => {
        if (id === request.current) setData(result);
      })
      .catch((e) => {
        if (id === request.current) setError(e.message);
      })
      .finally(() => {
        if (id === request.current) setBusy(false);
      });
    return () => {
      request.current++;
    };
  }, [range, from, to, revision]);
  async function ledger(type: string) {
    try {
      setDetail({
        title: type === "customers" ? "Customer balances" : "Supplier balances",
        rows: await window.pharmacy.ledger({ type }),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Dashboard</h1>
          <p>Today at a glance · {dateLabel(new Date().toISOString())}</p>
        </div>
        <button onClick={() => setRevision(revision + 1)}>Refresh</button>
        <button className="primary" onClick={onSale}>
          <Plus size={17} />
          New sale
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="metrics">
        {[
          [
            ShoppingCart,
            "Net sales incl GST",
            data ? "PKR " + money(data.today.net) : "—",
          ],
          [
            TrendingUp,
            "Gross profit",
            data ? "PKR " + money(data.today.profit) : "—",
          ],
          [ReceiptText, "Sales", data?.today.count ?? "—"],
          [
            Wallet,
            "Cash in drawer",
            data?.today.cash == null
              ? "No open shift"
              : "PKR " + money(data.today.cash),
          ],
        ].map(([Icon, label, value]: any) => (
          <section className="panel metric" key={label}>
            <span className="metric-icon">
              <Icon size={23} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </section>
        ))}
      </div>
      <div className="metrics">
        <section className="panel metric"><div><span>Today refunds</span><strong>{data ? 'PKR '+money(data.today.refunds) : '—'}</strong>{canViewProfit&&<button className="link" onClick={onReports}>View report ↗</button>}</div></section>
        <section className="panel metric"><div><span>Reorder products</span><strong>{data?.reorderCount ?? '—'}</strong><button className="link" onClick={onInventory}>View inventory ↗</button></div></section>
        {data?.today.operatingProfit!=null&&<section className="panel metric"><div><span>Operating profit</span><strong>PKR {money(data.today.operatingProfit)}</strong><button className="link" onClick={onReports}>View P&amp;L ↗</button></div></section>}
        {data?.vendorDues!=null&&<section className="panel metric"><div><span>Vendor dues</span><strong>PKR {money(data.vendorDues)}</strong><button className="link" onClick={onAccounts}>View accounts ↗</button></div></section>}
        {data?.expiredValue!=null&&<section className="panel metric"><div><span>Expired stock value</span><strong>PKR {money(data.expiredValue)}</strong><button className="link" onClick={onInventory}>View inventory ↗</button></div></section>}
      </div>
      <div className="dashboard-grid">
        <section className="panel"><h2>Business KPIs</h2><table><tbody>
          {[
            ['Month sales incl GST',data?.businessKpis.monthSalesMinor],
            ['Cash received today',data?.businessKpis.cashReceivedMinor],
            ['Digital received today',data?.businessKpis.digitalReceivedMinor],
            ['Credit created today',data?.businessKpis.creditCreatedMinor],
            ['Overdue dues',data?.businessKpis.overdueDuesMinor],
            ['Expenses incurred today',data?.businessKpis.expensesMinor],
          ].filter(([,value])=>value!=null).map(([label,value])=><tr key={String(label)}><th>{label}</th><td className="number">PKR {money(value as number)}</td></tr>)}
        </tbody></table>{!data&&<p>Loading business totals…</p>}</section>
        <section className="panel"><h2>Stock KPIs</h2><table><tbody>
          {[
            ['Total products',data?.stockKpis.totalProducts],
            ['Out-of-stock products',data?.stockKpis.outOfStockProducts],
            ['Low-stock products',data?.stockKpis.lowStockProducts],
            ['Near-expiry batches',data?.stockKpis.nearExpiryBatches],
            ['Expired batches',data?.stockKpis.expiredBatches],
          ].map(([label,value])=><tr key={String(label)}><th>{label}</th><td className="number">{value??'—'}</td></tr>)}
          {data?.stockKpis.totalStockValueMinor!=null&&<><tr><th>Total stock value</th><td className="number">PKR {money(data.stockKpis.totalStockValueMinor)}</td></tr><tr><th>Sellable stock value</th><td className="number">PKR {money(data.stockKpis.sellableStockValueMinor)}</td></tr></>}
        </tbody></table><button className="link" onClick={onInventory}>View inventory ↗</button></section>
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="chart-head">
            <div>
              <h2>Net sales</h2>
              <strong className="chart-total">
                PKR {money(data?.rangeTotal)}
              </strong>
            </div>
            <div className="segmented" aria-label="Chart date range">
              {ranges.map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={range === value}
                  onClick={() => setRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {range === "custom" && (
            <div className="custom-dates">
              <label>
                From
                <input
                  aria-label="From date"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  aria-label="To date"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          )}
          <p>
            {busy
              ? "Updating chart…"
              : data
                ? `${dateLabel(data.range.from)} – ${dateLabel(data.range.to)}`
                : "Loading sales…"}
          </p>
          <div aria-label="Net sales chart" aria-busy={busy}>
            <SalesChart
              bars={data?.chart || []}
              monthly={data?.range.monthly || false}
            />
          </div>
          {data?.range.monthly && (
            <small>
              First and last months include only dates within the selected
              range.
            </small>
          )}
        </section>
        <section className="panel alerts">
          <h2>Needs attention</h2>
          <button
            className="alert-row"
            onClick={() =>
              setDetail({
                title: "Low-stock products (up to 100)",
                rows: data?.low || [],
              })
            }
          >
            <TriangleAlert />
            <span>
              <strong>
                {data?.low.length ?? "—"}
                {data?.low.length === 100 ? "+" : ""} low-stock products
              </strong>
              <small>At or below minimum stock</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button
            className="alert-row"
            onClick={() =>
              setDetail({
                title: "Expiring batches (up to 100)",
                rows: data?.expiry || [],
              })
            }
          >
            <Clock />
            <span>
              <strong>
                {data?.expiry.length ?? "—"}
                {data?.expiry.length === 100 ? "+" : ""} batches expiring soon
              </strong>
              <small>Within the next 30 days</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="panel recent">
          <h2>Recent sales</h2>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th className="number">Net total</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent.map((row) => (
                <tr key={row.id}>
                  <td>
                    {new Date(row.sold_at).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Karachi",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="invoice-ref" title={row.invoice_number}>
                    {row.invoice_number}
                  </td>
                  <td>{row.customer_name_snapshot || "Walk-in"}</td>
                  <td className="number">{money(row.final_total_minor)}</td>
                  <td>
                    <span className="badge">{row.payment_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.recent.length && <p>No sales yet.</p>}
        </section>
        <section className="panel balances">
          <h2>Receivables &amp; Payables</h2>
          {data?.balances ? (
            <div className="balance-columns">
              <div>
                <p>Customer receivables</p>
                <strong>PKR {money(data.balances.receivable.total)}</strong>
                <div className="balance-warning">
                  Overdue<b>PKR {money(data.balances.receivable.overdue)}</b>
                </div>
                <button className="link" onClick={() => ledger("customers")}>
                  Customer Ledger ↗
                </button>
              </div>
              <div>
                <p>Supplier payables</p>
                <strong>PKR {money(data.balances.payable.total)}</strong>
                <div className="balance-warning">
                  Due in 7 days<b>PKR {money(data.balances.payable.soon)}</b>
                </div>
                <button className="link" onClick={() => ledger("suppliers")}>
                  Supplier Ledger ↗
                </button>
              </div>
            </div>
          ) : (
            <p>Available to users with account-management permission.</p>
          )}
        </section>
      </div>
      {detail && (
        <Dialog title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-list">
            {detail.rows.map((row, i) => (
              <article key={i}>
                <strong>{row.name}</strong>
                <span>
                  {row.balance_minor != null
                    ? "PKR " + money(row.balance_minor)
                    : row.batch_number || `${row.quantity} ${row.unit}`}
                </span>
                <small>{row.due_date || row.expiry_date || ""}</small>
              </article>
            ))}
            {!detail.rows.length && <p>No matching records.</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
