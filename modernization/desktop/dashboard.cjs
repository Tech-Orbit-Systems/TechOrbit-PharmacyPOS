const { rangeFor, dayKey, addDays } = require("./ranges.cjs");
function dashboard(db, input, { userId, financial, costVisible=false, now = new Date() }) {
  const range = rangeFor(input, now),
    today = dayKey(now);
  const daily = rangeFor({ range: "custom", from: today, to: today }, now);
  const month=rangeFor({range:'custom',from:today.slice(0,7)+'-01',to:today},now);
  // Normalize mixed UTC and offset timestamps before applying Pakistan-day cutoffs.
  const totals = (from, to) => {
    const sales = db
      .prepare(
        "SELECT COALESCE(SUM(final_total_minor),0) sales,COALESCE(SUM(cogs_minor),0) cogs,COUNT(*) count FROM Sales WHERE status='posted' AND julianday(sold_at)>=julianday(?) AND julianday(sold_at)<julianday(?)",
      )
      .get(from, to);
    const returns = db
      .prepare(
        "SELECT COALESCE(SUM(total_minor),0) amount FROM SaleReturns WHERE julianday(returned_at)>=julianday(?) AND julianday(returned_at)<julianday(?)",
      )
      .get(from, to).amount;
    const returnedCost = db
      .prepare(
        "SELECT COALESCE(SUM(i.cogs_minor),0) amount FROM SaleReturnItems i JOIN SaleReturns r ON r.id=i.sale_return_id WHERE julianday(r.returned_at)>=julianday(?) AND julianday(r.returned_at)<julianday(?)",
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
    SELECT strftime('${format}',sold_at,'+5 hours') key,final_total_minor amount FROM Sales WHERE status='posted' AND julianday(sold_at)>=julianday(?) AND julianday(sold_at)<julianday(?)
    UNION ALL SELECT strftime('${format}',returned_at,'+5 hours') key,-total_minor amount FROM SaleReturns WHERE julianday(returned_at)>=julianday(?) AND julianday(returned_at)<julianday(?)
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
          "SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount_minor ELSE -amount_minor END),0) amount FROM MoneyMovements WHERE method='cash' AND shift_id=? AND occurred_at>=? AND occurred_at<?",
        )
        .get(shift.id, shift.opened_at, now.toISOString()).amount
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
  const pnl=costVisible?require('./reports.cjs').profitLoss(db,{range:'custom',from:today,to:today},now):null;
  const refunds=db.prepare("SELECT COALESCE(SUM(refund_minor),0) total FROM SaleReturns WHERE julianday(returned_at)>=julianday(?) AND julianday(returned_at)<julianday(?)").get(daily.start,daily.end).total;
  const vendorDues=financial?db.prepare("SELECT COALESCE(SUM(balance_minor),0) total FROM ExpensePayables WHERE balance_minor>0 AND status IN ('unpaid','partial')").get().total:null;
  const stock=costVisible?db.prepare(`SELECT COALESCE(SUM(CASE WHEN b.expiry_date<=? THEN b.quantity_on_hand*COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) ELSE 0 END),0) expiredValue
    FROM ProductBatches b WHERE b.quantity_on_hand>0`).get(today):null;
  const reorderCount=db.prepare(`SELECT COUNT(*) count FROM (SELECT p.id FROM Products p LEFT JOIN ProductBatches b ON b.product_id=p.id
    WHERE p.active=1 GROUP BY p.id HAVING COALESCE(SUM(CASE WHEN b.expiry_date IS NULL OR b.expiry_date>? THEN b.quantity_on_hand ELSE 0 END),0)<=MAX(p.minimum_stock,p.reorder_level))`).get(today).count;
  const productCounts=db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN sellable=0 THEN 1 ELSE 0 END),0) outOfStock FROM (
    SELECT p.id,COALESCE(SUM(CASE WHEN b.expiry_date IS NULL OR b.expiry_date>? THEN b.quantity_on_hand ELSE 0 END),0) sellable
    FROM Products p LEFT JOIN ProductBatches b ON b.product_id=p.id WHERE p.active=1 GROUP BY p.id)`).get(today);
  const batchCounts=db.prepare(`SELECT COALESCE(SUM(CASE WHEN expiry_date>? AND expiry_date<=? THEN 1 ELSE 0 END),0) nearExpiry,
    COALESCE(SUM(CASE WHEN expiry_date<=? THEN 1 ELSE 0 END),0) expired FROM ProductBatches
    WHERE quantity_on_hand>0`).get(today,addDays(today,30),today);
  const inventoryValue=costVisible?db.prepare(`SELECT COALESCE(SUM(quantity_on_hand*cost),0) total,
    COALESCE(SUM(CASE WHEN active=1 AND (expiry_date IS NULL OR expiry_date>?) THEN quantity_on_hand*cost ELSE 0 END),0) sellable
    FROM (SELECT b.quantity_on_hand,b.expiry_date,p.active,COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) cost
    FROM ProductBatches b JOIN Products p ON p.id=b.product_id WHERE b.quantity_on_hand>0)`).get(today):null;
  const received=db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN method='cash' THEN amount_minor ELSE 0 END),0) cash,
    COALESCE(SUM(CASE WHEN method IN ('card','digital','bank_transfer','mobile_wallet') THEN amount_minor ELSE 0 END),0) digital
    FROM MoneyMovements WHERE direction='in' AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)`).get(daily.start,daily.end);
  const creditCreated=financial?db.prepare("SELECT COALESCE(SUM(balance_due_minor),0) total FROM Sales WHERE status='posted' AND julianday(sold_at)>=julianday(?) AND julianday(sold_at)<julianday(?)").get(daily.start,daily.end).total:null;
  const overdue=financial?db.prepare(`SELECT
    (SELECT COALESCE(SUM(balance_minor),0) FROM Receivables WHERE balance_minor>0 AND due_date<?)+
    (SELECT COALESCE(SUM(balance_minor),0) FROM Payables WHERE balance_minor>0 AND due_date<?)+
    (SELECT COALESCE(SUM(balance_minor),0) FROM ExpensePayables WHERE balance_minor>0 AND due_date<?) total`).get(today,today,today).total:null;
  return {
    range,
    chart: range.keys.map((key) => ({
      key,
      amount: buckets.find((row) => row.key === key)?.amount || 0,
    })),
    rangeTotal: buckets.reduce((sum, row) => sum + row.amount, 0),
    today: { ...metrics, profit: pnl?.grossProfitMinor??null,operatingProfit:pnl?.operatingProfitMinor??null,
      netExGst:pnl?.netRevenueMinor??null,refunds,cash },
    vendorDues,expiredValue:stock?Math.round(stock.expiredValue):null,reorderCount,
    businessKpis:{monthSalesMinor:totals(month.start,month.end).net,cashReceivedMinor:received.cash,
      digitalReceivedMinor:received.digital,creditCreatedMinor:creditCreated,overdueDuesMinor:overdue,
      expensesMinor:pnl?.expensesMinor??null},
    stockKpis:{totalProducts:productCounts.total,outOfStockProducts:productCounts.outOfStock,
      lowStockProducts:reorderCount,nearExpiryBatches:batchCounts.nearExpiry,expiredBatches:batchCounts.expired,
      totalStockValueMinor:inventoryValue?Math.round(inventoryValue.total):null,
      sellableStockValueMinor:inventoryValue?Math.round(inventoryValue.sellable):null},
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
