class CashClosingService {
  constructor(db) {
    this.db = db;
    this.openTx = db.transaction(x => this.openInternal(x));
    this.closeTx = db.transaction(x => this.closeInternal(x));
  }
  open(x) {
    const opening = Number(x?.openingCashMinor);
    if (!x?.deviceId?.trim() || !Number.isSafeInteger(opening) || opening < 0)
      throw new Error('Device and non-negative opening cash are required');
    return this.openTx(x);
  }
  openInternal(x) {
    const rawAt = x.openedAt || new Date().toISOString(), now = new Date().toISOString();
    const opening = Number(x.openingCashMinor);
    if (Number.isNaN(Date.parse(rawAt)) || Date.parse(rawAt) > Date.parse(now)) throw new Error('Invalid shift opening time');
    const at = new Date(rawAt).toISOString();
    if (this.db.prepare("SELECT 1 FROM CashShifts WHERE device_id=? AND status='open'").get(x.deviceId.trim()))
      throw new Error('Close the current device shift before opening another');
    const previous = this.db.prepare('SELECT closed_at FROM CashShifts WHERE device_id=? ORDER BY opened_at DESC LIMIT 1').get(x.deviceId.trim());
    if (previous && (!previous.closed_at || Date.parse(at) < Date.parse(previous.closed_at))) throw new Error('Shift windows cannot overlap');
    const id = this.db.prepare("INSERT INTO CashShifts(user_id,device_id,opened_at,opening_cash_minor,status,created_at) VALUES (?,?,?,?,'open',?)")
      .run(x.userId || null, x.deviceId.trim(), at, opening, now).lastInsertRowid;
    this.audit('cash_shift.open', id, x, { openingCashMinor: opening });
    return this.db.prepare('SELECT * FROM CashShifts WHERE id=?').get(id);
  }
  close(x) {
    if (!x?.shiftId || !Number.isSafeInteger(Number(x.countedCashMinor)) || Number(x.countedCashMinor) < 0)
      throw new Error('Shift and non-negative counted cash are required');
    return this.closeTx(x);
  }
  shiftPreview(x) {
    const shift = this.db.prepare('SELECT * FROM CashShifts WHERE id=?').get(x?.shiftId);
    if (!shift) throw new Error('Cash shift was not found');
    const rawAt = shift.closed_at || x?.asOf || new Date().toISOString();
    if (Number.isNaN(Date.parse(rawAt)) || Date.parse(rawAt) < Date.parse(shift.opened_at) || Date.parse(rawAt) > Date.now())
      throw new Error('Invalid shift preview time');
    const at = new Date(rawAt).toISOString();
    const rows = this.db.prepare(`SELECT method,direction,COALESCE(SUM(amount_minor),0) amount
      FROM MoneyMovements WHERE shift_id=? AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)
      GROUP BY method,direction ORDER BY method,direction`).all(shift.id, shift.opened_at, at);
    const unresolved = this.db.prepare(`SELECT COUNT(*) count FROM MoneyMovements
      WHERE method='cash' AND shift_id IS NULL AND user_id IS ?
      AND (device_id IS NULL OR device_id=?) AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)`)
      .get(shift.user_id, shift.device_id, shift.opened_at, at).count;
    const cashNet = rows.filter(row=>row.method==='cash').reduce((sum,row)=>sum+(row.direction==='in'?row.amount:-row.amount),0);
    return {shiftId:Number(shift.id),userId:shift.user_id,deviceId:shift.device_id,status:shift.status,
      openedAt:shift.opened_at,closedAt:shift.closed_at,openingCashMinor:shift.opening_cash_minor,
      expectedCashMinor:shift.opening_cash_minor+cashNet,countedCashMinor:shift.counted_cash_minor,
      varianceMinor:shift.variance_minor,unattributedCashCount:unresolved,movements:rows};
  }
  closeInternal(x) {
    const shift = this.db.prepare('SELECT * FROM CashShifts WHERE id=?').get(x.shiftId);
    if (!shift) throw new Error('Cash shift was not found');
    if (shift.status !== 'open') throw new Error('Cash shift is already closed');
    if (x.userId && shift.user_id !== x.userId) throw new Error('Only the assigned cashier can close this shift');
    const rawAt = x.closedAt || new Date().toISOString();
    if (Number.isNaN(Date.parse(rawAt)) || Date.parse(rawAt) <= Date.parse(shift.opened_at) || Date.parse(rawAt) > Date.now())
      throw new Error('Shift closing must be after opening and no later than now');
    const at = new Date(rawAt).toISOString();
    const preview = this.shiftPreview({shiftId:shift.id,asOf:at});
    if (preview.unattributedCashCount) throw new Error('Unattributed cash movements need reconciliation before closing');
    const expected = preview.expectedCashMinor;
    const counted = Number(x.countedCashMinor), variance = counted - expected;
    this.db.prepare("UPDATE CashShifts SET status='closed',closed_at=?,expected_cash_minor=?,counted_cash_minor=?,variance_minor=?,notes=? WHERE id=?")
      .run(at, expected, counted, variance, x.notes || null, shift.id);
    this.audit('cash_shift.close', shift.id, x, { expected, counted, variance });
    return { shiftId: Number(shift.id), expectedCashMinor: expected, countedCashMinor: counted, varianceMinor: variance, status: 'closed' };
  }
  sixMonthReport(asOf = new Date().toISOString()) {
    const end = new Date(asOf);
    if (Number.isNaN(end.getTime()) || end.getTime() > Date.now()) throw new Error('Invalid report date');
    const pakistan = new Date(end.getTime() + 5 * 3600000);
    const year = pakistan.getUTCFullYear(), month = pakistan.getUTCMonth();
    const months = [];
    for (let offset = 5; offset >= 0; offset--) {
      const start = new Date(Date.UTC(year, month - offset, 1) - 5 * 3600000);
      const next = new Date(Date.UTC(year, month - offset + 1, 1) - 5 * 3600000);
      const from = start.toISOString(), to = offset === 0 ? end.toISOString() : next.toISOString();
      const sales = this.db.prepare("SELECT COALESCE(SUM(final_total_minor),0) total,COALESCE(SUM(cogs_minor),0) cogs,COALESCE(SUM(gst_minor),0) gst FROM Sales WHERE status='posted' AND julianday(sold_at)>=julianday(?) AND julianday(sold_at)<julianday(?)").get(from, to);
      const customerReturns = this.db.prepare(`SELECT COALESCE(SUM(r.total_minor),0) amount,
        COALESCE(SUM((SELECT SUM(i.cogs_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id)),0) cogs,
        COALESCE(SUM((SELECT SUM(i.gst_minor) FROM SaleReturnItems i WHERE i.sale_return_id=r.id)),0) gst
        FROM SaleReturns r WHERE julianday(r.returned_at)>=julianday(?) AND julianday(r.returned_at)<julianday(?)`).get(from, to);
      const expenses = this.db.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM Expenses WHERE status='posted' AND julianday(expense_date)>=julianday(?) AND julianday(expense_date)<julianday(?)").get(from, to).total;
      const purchases = this.db.prepare("SELECT COALESCE(SUM(total_minor),0) total FROM Purchases WHERE status='posted' AND julianday(purchased_at)>=julianday(?) AND julianday(purchased_at)<julianday(?)").get(from, to).total;
      const returns = this.db.prepare("SELECT COALESCE(SUM(total_minor),0) total FROM PurchaseReturns WHERE julianday(returned_at)>=julianday(?) AND julianday(returned_at)<julianday(?)").get(from, to).total;
      const netSalesMinor = Number(sales.total) - Number(customerReturns.amount);
      const gstMinor = Number(sales.gst) - Number(customerReturns.gst);
      const cogsMinor = Number(sales.cogs) - Number(customerReturns.cogs);
      const grossProfitMinor = netSalesMinor - gstMinor - cogsMinor;
      months.push({ month: new Date(start.getTime() + 5 * 3600000).toISOString().slice(0,7),
        salesMinor: Number(sales.total), customerReturnsMinor: Number(customerReturns.amount),
        netSalesMinor, gstMinor, cogsMinor, grossProfitMinor, expensesMinor: Number(expenses),
        operatingProfitMinor: grossProfitMinor - Number(expenses), purchasesMinor: Number(purchases),
        purchaseReturnsMinor: Number(returns) });
    }
    const fields = ['salesMinor','customerReturnsMinor','netSalesMinor','gstMinor','cogsMinor','grossProfitMinor','expensesMinor','operatingProfitMinor','purchasesMinor','purchaseReturnsMinor'];
    return { periodStart: `${months[0].month}-01`, periodEnd: pakistan.toISOString().slice(0,10), asOf: end.toISOString(), months,
      totals: months.reduce((a,m)=>{for(const k of fields)a[k]+=m[k];return a;},Object.fromEntries(fields.map(k=>[k,0]))) };
  }
  closeSixMonth(x) {
    const report = this.sixMonthReport(x.asOf), now = new Date().toISOString();
    const id = this.db.prepare("INSERT INTO PeriodClosings(period_type,period_start,period_end,totals_json,closed_at,closed_by,notes) VALUES ('six_month',?,?,?,?,?,?)")
      .run(report.periodStart, report.periodEnd, JSON.stringify(report.totals), now, x.closedBy || null, x.notes || null).lastInsertRowid;
    this.audit('period.close', id, x, report);
    return { closingId: Number(id), ...report };
  }
  audit(action, id, x, next) {
    this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json,reason,device_id) VALUES (?,?,?,'closing',?,?,?,?)")
      .run(new Date().toISOString(), x.userId || x.closedBy || null, action, String(id), JSON.stringify(next), x.reason || null, x.deviceId || null);
  }
}
module.exports = { CashClosingService };
