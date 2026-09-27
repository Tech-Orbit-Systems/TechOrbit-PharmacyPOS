class DailyClosingService {
  constructor(db) { this.db = db; }
  manager(userId) {
    const row = this.db.prepare('SELECT r.code FROM Users u JOIN Roles r ON r.id=u.role_id WHERE u.id=? AND u.active=1').get(userId);
    if (!row || !['manager','admin'].includes(row.code)) throw new Error('Manager permission is required for official closing');
  }
  day(id) {
    const row = id
      ? this.db.prepare('SELECT * FROM BusinessDays WHERE id=?').get(id)
      : this.db.prepare("SELECT * FROM BusinessDays WHERE status='open'").get();
    if (!row) throw new Error('Business day was not found');
    return row;
  }
  preview(input = {}) {
    const day = this.day(input.businessDayId);
    if (day.status === 'closed') return JSON.parse(day.snapshot_json);
    const asOf = input.asOf || new Date().toISOString();
    if (Number.isNaN(Date.parse(asOf)) || Date.parse(asOf) <= Date.parse(day.opened_at) || Date.parse(asOf) > Date.now())
      throw new Error('Invalid official closing time');
    const at = new Date(asOf).toISOString();
    const shifts = this.db.prepare(`SELECT id,user_id,device_id,opened_at,closed_at,status,opening_cash_minor,
      expected_cash_minor,counted_cash_minor,variance_minor,variance_reason,approved_by,forced_close_reason,handover_from_shift_id
      FROM CashShifts WHERE business_day_id=? ORDER BY opened_at,id`).all(day.id);
    const openShifts = shifts.filter(row=>row.status==='open').length;
    const legacyOpenShifts = this.db.prepare("SELECT COUNT(*) count FROM CashShifts WHERE status='open' AND business_day_id IS NULL").get().count;
    const movements = this.db.prepare(`SELECT m.id,m.method,m.direction,m.amount_minor,m.shift_id,s.business_day_id,a.account_id,c.kind,c.name
      FROM MoneyMovements m LEFT JOIN ClosingMovementAllocations a ON a.movement_id=m.id
      LEFT JOIN CashShifts s ON s.id=m.shift_id
      LEFT JOIN ClosingAccounts c ON c.id=a.account_id
      WHERE julianday(m.occurred_at)>=julianday(?) AND julianday(m.occurred_at)<julianday(?)
      ORDER BY m.id`).all(day.opened_at,at);
    const unresolved = movements.filter(row=>row.business_day_id!==day.id ||
      (row.method!=='cash' && row.method!=='credit' && !row.account_id));
    const byAccount = new Map();
    for (const movement of movements) {
      if (!movement.account_id) continue;
      let item = byAccount.get(movement.account_id);
      if (!item) {
        item={id:movement.account_id,kind:movement.kind,name:movement.name,inMinor:0,outMinor:0,expectedNetMinor:0};
        byAccount.set(item.id,item);
      }
      item[movement.direction==='in'?'inMinor':'outMinor'] += movement.amount_minor;
      item.expectedNetMinor += movement.direction==='in' ? movement.amount_minor : -movement.amount_minor;
    }
    const cash = movements.filter(row=>row.method==='cash').reduce((sum,row)=>sum+(row.direction==='in'?row.amount_minor:-row.amount_minor),0);
    const firstByDevice=new Map(),lastByDevice=new Map();
    for(const shift of shifts){
      if(!firstByDevice.has(shift.device_id))firstByDevice.set(shift.device_id,shift);
      lastByDevice.set(shift.device_id,shift);
    }
    const cashOpeningMinor=[...firstByDevice.values()].reduce((sum,row)=>sum+row.opening_cash_minor,0);
    const cashExpectedMinor=cashOpeningMinor+cash;
    const cashCountedMinor=[...lastByDevice.values()].every(row=>row.counted_cash_minor!==null)
      ? [...lastByDevice.values()].reduce((sum,row)=>sum+row.counted_cash_minor,0) : null;
    const savingsMinor=this.db.prepare(`SELECT COALESCE(SUM(amount_minor),0) total FROM SavingsTransfers
      WHERE julianday(transferred_at)>=julianday(?) AND julianday(transferred_at)<julianday(?)`).get(day.opened_at,at).total;
    return {businessDayId:day.id,openedAt:day.opened_at,asOf:at,status:'open',shiftCount:shifts.length,
      openShifts,legacyOpenShifts,unresolvedMovementCount:unresolved.length,
      unresolvedMovements:unresolved.map(row=>({id:row.id,method:row.method,direction:row.direction,amountMinor:row.amount_minor,needsShift:row.business_day_id!==day.id})),
      cashOpeningMinor,cashExpectedMinor,cashCountedMinor,
      cashVarianceMinor:cashCountedMinor===null?null:cashCountedMinor-cashExpectedMinor,
      accounts:[...byAccount.values()],savingsTransferredMinor:savingsMinor,shifts};
  }
  close(input) {
    this.manager(input?.userId);
    return this.db.transaction(()=>{
      const preview=this.preview(input);
      if(preview.openShifts || preview.legacyOpenShifts) throw new Error('Close every cashier shift before official daily close');
      if(!preview.shiftCount) throw new Error('Official close needs at least one shift');
      if(preview.shifts.some(row=>Date.parse(row.closed_at)>Date.parse(preview.asOf)))throw new Error('Official close cannot precede a cashier shift close');
      if(preview.unresolvedMovementCount) throw new Error('Allocate or reconcile every money movement before official close');
      const actuals=input.accountActuals || {};
      const accounts=preview.accounts.map(account=>{
        const actual=Number(actuals[account.id]);
        if(!Number.isSafeInteger(actual)) throw new Error(`Actual statement amount is required for ${account.name}`);
        return {...account,actualNetMinor:actual,varianceMinor:actual-account.expectedNetMinor};
      });
      const reason=String(input.reason||'').trim();
      if(accounts.some(row=>row.varianceMinor!==0) && !reason) throw new Error('Digital variance requires a reason');
      const snapshot={...preview,status:'closed',closedAt:preview.asOf,closedBy:input.userId,accounts,reason:reason||null};
      this.db.prepare("UPDATE BusinessDays SET status='closed',closed_at=?,closed_by=?,close_reason=?,snapshot_json=? WHERE id=? AND status='open'")
        .run(preview.asOf,input.userId,reason||null,JSON.stringify(snapshot),preview.businessDayId);
      this.audit('business_day.close',preview.businessDayId,input.userId,snapshot,reason);
      return snapshot;
    })();
  }
  revise(input) {
    this.manager(input?.userId);
    const reason=String(input?.reason||'').trim();
    if(!reason) throw new Error('Closing revision requires a reason');
    return this.db.transaction(()=>{
      const day=this.day(input.businessDayId);
      if(day.status!=='closed')throw new Error('Only a closed business day can be revised');
      const previous=this.latestSnapshot(day);
      const cashCounted=Number(input.cashCountedMinor ?? previous.cashCountedMinor);
      if(!Number.isSafeInteger(cashCounted)||cashCounted<0)throw new Error('Revised counted cash must be non-negative');
      const actuals=input.accountActuals||{};
      const accounts=previous.accounts.map(row=>{
        const actual=Number(actuals[row.id] ?? row.actualNetMinor);
        if(!Number.isSafeInteger(actual))throw new Error(`Invalid actual statement amount for ${row.name}`);
        return {...row,actualNetMinor:actual,varianceMinor:actual-row.expectedNetMinor};
      });
      const revisionNumber=this.db.prepare('SELECT COALESCE(MAX(revision_number),0)+1 number FROM BusinessDayRevisions WHERE business_day_id=?').get(day.id).number;
      const snapshot={...previous,cashCountedMinor:cashCounted,cashVarianceMinor:cashCounted-previous.cashExpectedMinor,accounts,
        revisionNumber,revisedAt:new Date().toISOString(),revisedBy:input.userId,revisionReason:reason};
      this.db.prepare(`INSERT INTO BusinessDayRevisions(business_day_id,revision_number,previous_snapshot_json,snapshot_json,reason,revised_at,revised_by)
        VALUES(?,?,?,?,?,?,?)`).run(day.id,revisionNumber,JSON.stringify(previous),JSON.stringify(snapshot),reason,snapshot.revisedAt,input.userId);
      this.audit('business_day.revise',day.id,input.userId,snapshot,reason);
      return snapshot;
    })();
  }
  latestSnapshot(day) {
    const revision=this.db.prepare('SELECT snapshot_json FROM BusinessDayRevisions WHERE business_day_id=? ORDER BY revision_number DESC LIMIT 1').get(day.id);
    return JSON.parse(revision?.snapshot_json || day.snapshot_json);
  }
  history() {
    return this.db.prepare("SELECT id,opened_at,closed_at,closed_by FROM BusinessDays WHERE status='closed' ORDER BY closed_at DESC,id DESC").all()
      .map(row=>({...row,revisionCount:this.db.prepare('SELECT COUNT(*) count FROM BusinessDayRevisions WHERE business_day_id=?').get(row.id).count}));
  }
  detail(id) {
    const day=this.day(id);
    if(day.status!=='closed')return this.preview({businessDayId:id});
    return {original:JSON.parse(day.snapshot_json),current:this.latestSnapshot(day),revisions:this.db.prepare(
      'SELECT revision_number,reason,revised_at,revised_by FROM BusinessDayRevisions WHERE business_day_id=? ORDER BY revision_number').all(id)};
  }
  audit(action,id,userId,next,reason) {
    this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json,reason)
      VALUES(?,?,?,'business_day',?,?,?)`).run(new Date().toISOString(),userId,action,String(id),JSON.stringify(next),reason||null);
  }
}
module.exports={DailyClosingService};
