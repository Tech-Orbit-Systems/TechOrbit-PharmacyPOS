const { rangeFor, dayKey, addDays } = require("./ranges.cjs");
function dashboard(db, input, { userId, financial, now = new Date() }) {
  const range = rangeFor(input, now),
    today = dayKey(now);
  const daily = rangeFor({ range: "custom", from: today, to: today }, now);
  // Filter using the indexed raw timestamp; timezone conversion is only for grouping.
  const totals = (from, to) => {
    const sales = db
      .prepare(
        "SELECT COALESCE(SUM(final_total_minor),0) sales,COALESCE(SUM(cogs_minor),0) cogs,COUNT(*) count FROM Sales WHERE status='posted' AND sold_at>=? AND sold_at<?",
      )
      .get(from, to);
    const returns = db
      .prepare(
        "SELECT COALESCE(SUM(total_minor),0) amount FROM SaleReturns WHERE returned_at>=? AND returned_at<?",
      )
      .get(from, to).amount;
    const returnedCost = db
      .prepare(
        "SELECT COALESCE(SUM(i.cogs_minor),0) amount FROM SaleReturnItems i JOIN SaleReturns r ON r.id=i.sale_return_id WHERE r.returned_at>=? AND r.returned_at<?",
      )
      .get(from, to).amount;
    return {
      net: sales.sales - returns,
      profit: sales.sales - returns - sales.cogs + returnedCost,
      count: sales.count,
    };
  };
  const format = range.monthly ? "%Y-%m" : "%Y-%m-%d";
  const buckets = db
    .prepare(
      `SELECT key,SUM(amount) amount FROM (
    SELECT strftime('${format}',sold_at,'+5 hours') key,final_total_minor amount FROM Sales WHERE status='posted' AND sold_at>=? AND sold_at<?
    UNION ALL SELECT strftime('${format}',returned_at,'+5 hours') key,-total_minor amount FROM SaleReturns WHERE returned_at>=? AND returned_at<?
  ) GROUP BY key`,
    )
    .all(range.start, range.end, range.start, range.end);
  const shift = db
    .prepare(
      "SELECT * FROM CashShifts WHERE user_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1",
    )
    .get(userId);
  const cash = shift
    ? shift.opening_cash_minor +
      db
        .prepare(
          "SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount_minor ELSE -amount_minor END),0) amount FROM MoneyMovements WHERE method='cash' AND user_id=? AND occurred_at>=? AND occurred_at<=?",
        )
        .get(userId, shift.opened_at, now.toISOString()).amount
    : null;
  const low = db
    .prepare(
      `SELECT p.id,p.name,p.base_unit unit,COALESCE(SUM(CASE WHEN b.expiry_date IS NULL OR b.expiry_date>? THEN b.quantity_on_hand ELSE 0 END),0) quantity
    FROM Products p LEFT JOIN ProductBatches b ON b.product_id=p.id WHERE p.active=1 GROUP BY p.id HAVING quantity<=MAX(p.minimum_stock,p.reorder_level) ORDER BY quantity,p.name LIMIT 100`,
    )
    .all(today);
  const expiry = db
    .prepare(
      "SELECT b.id,p.name,b.batch_number,b.expiry_date,b.quantity_on_hand FROM ProductBatches b JOIN Products p ON p.id=b.product_id WHERE p.active=1 AND b.quantity_on_hand>0 AND b.expiry_date>? AND b.expiry_date<=? ORDER BY b.expiry_date LIMIT 100",
    )
    .all(today, addDays(today, 30));
  const balances = financial
    ? {
        receivable: db
          .prepare(
            "SELECT COALESCE(SUM(balance_minor),0) total,COALESCE(SUM(CASE WHEN due_date<? THEN balance_minor ELSE 0 END),0) overdue FROM Receivables WHERE balance_minor>0",
          )
          .get(today),
        payable: db
          .prepare(
            "SELECT COALESCE(SUM(balance_minor),0) total,COALESCE(SUM(CASE WHEN due_date>=? AND due_date<=? THEN balance_minor ELSE 0 END),0) soon FROM Payables WHERE balance_minor>0",
          )
          .get(today, addDays(today, 7)),
      }
    : null;
  const metrics = totals(daily.start, daily.end);
  return {
    range,
    chart: range.keys.map((key) => ({
      key,
      amount: buckets.find((row) => row.key === key)?.amount || 0,
    })),
    rangeTotal: buckets.reduce((sum, row) => sum + row.amount, 0),
    today: { ...metrics, profit: financial ? metrics.profit : null, cash },
    shift: Boolean(shift),
    low,
    expiry,
    balances,
    recent: db
      .prepare(
        "SELECT id,invoice_number,sold_at,customer_name_snapshot,final_total_minor,payment_status FROM Sales WHERE status='posted' ORDER BY sold_at DESC,id DESC LIMIT 5",
      )
      .all(),
  };
}
module.exports = { dashboard };
