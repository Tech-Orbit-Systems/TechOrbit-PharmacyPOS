const ACCOUNT_KINDS = new Set(['bank', 'wallet', 'savings']);

class ClosingConfigurationService {
  constructor(db) { this.db = db; }
  requireManager(actorId) {
    const row = this.db.prepare('SELECT r.code FROM Users u JOIN Roles r ON r.id=u.role_id WHERE u.id=? AND u.active=1').get(actorId);
    if (!row || !['manager','admin'].includes(row.code)) throw new Error('Manager permission is required for closing configuration');
  }
  setting(key, fallback) {
    const row = this.db.prepare('SELECT value_json FROM Settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value_json) : fallback;
  }
  policy() {
    return {
      varianceToleranceMinor: this.setting('closingVarianceToleranceMinor', 5000),
      sixMonthCycleStartMonth: this.setting('sixMonthCycleStartMonth', 1),
    };
  }
  savePolicy(input, actorId) {
    this.requireManager(actorId);
    const tolerance = Number(input?.varianceToleranceMinor);
    const month = Number(input?.sixMonthCycleStartMonth);
    if (!Number.isSafeInteger(tolerance) || tolerance < 0 || tolerance > 1000000)
      throw new Error('Variance tolerance must be between Rs 0 and Rs 10,000');
    if (!Number.isSafeInteger(month) || month < 1 || month > 12)
      throw new Error('Six-month cycle start month must be 1 to 12');
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const [key, value] of Object.entries({closingVarianceToleranceMinor:tolerance,sixMonthCycleStartMonth:month})) {
        this.db.prepare(`INSERT INTO Settings(key,value_json,updated_by,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .run(key, JSON.stringify(value), actorId, now);
      }
      this.audit('closing.policy_update', 'policy', actorId, {varianceToleranceMinor:tolerance,sixMonthCycleStartMonth:month});
    })();
    return this.policy();
  }
  accounts() {
    return this.db.prepare('SELECT id,kind,name,active FROM ClosingAccounts ORDER BY kind,name,id').all();
  }
  saveAccount(input, actorId) {
    this.requireManager(actorId);
    const kind = String(input?.kind || '').trim();
    const name = String(input?.name || '').trim();
    if (!ACCOUNT_KINDS.has(kind)) throw new Error('Choose a bank, wallet or savings account');
    if (!name || name.length > 100) throw new Error('Account name must be 1 to 100 characters');
    const active = input?.active === false ? 0 : 1;
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      let id;
      if (input.id) {
        const existing = this.db.prepare('SELECT id FROM ClosingAccounts WHERE id=?').get(input.id);
        if (!existing) throw new Error('Closing account was not found');
        this.db.prepare('UPDATE ClosingAccounts SET kind=?,name=?,active=?,updated_at=? WHERE id=?')
          .run(kind,name,active,now,input.id);
        id = Number(input.id);
      } else {
        id = Number(this.db.prepare('INSERT INTO ClosingAccounts(kind,name,active,created_at,updated_at) VALUES(?,?,?,?,?)')
          .run(kind,name,active,now,now).lastInsertRowid);
      }
      const result = this.db.prepare('SELECT id,kind,name,active FROM ClosingAccounts WHERE id=?').get(id);
      this.audit('closing.account_save', id, actorId, result);
      return result;
    })();
  }
  allocate(input, actorId) {
    this.requireManager(actorId);
    const movement = this.db.prepare(`SELECT m.id,m.method,b.status day_status FROM MoneyMovements m
      LEFT JOIN CashShifts s ON s.id=m.shift_id LEFT JOIN BusinessDays b ON b.id=s.business_day_id
      WHERE m.id=?`).get(input?.movementId);
    const account = this.db.prepare('SELECT id,kind,active FROM ClosingAccounts WHERE id=?').get(input?.accountId);
    if (!movement || !account || !account.active) throw new Error('Movement and active account are required');
    if (movement.day_status === 'closed') throw new Error('Closed business day allocations cannot be changed');
    if (movement.method === 'cash' || movement.method === 'credit') throw new Error('Cash or credit cannot be assigned to a bank or wallet');
    if (account.kind === 'savings') throw new Error('Savings transfers have a separate record');
    if (movement.method === 'mobile_wallet' && account.kind !== 'wallet') throw new Error('Choose a wallet account');
    if (['card','bank_transfer'].includes(movement.method) && account.kind !== 'bank') throw new Error('Choose a bank account');
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      this.db.prepare(`INSERT INTO ClosingMovementAllocations(movement_id,account_id,allocated_at,allocated_by)
        VALUES(?,?,?,?) ON CONFLICT(movement_id) DO UPDATE SET account_id=excluded.account_id,allocated_at=excluded.allocated_at,allocated_by=excluded.allocated_by`)
        .run(movement.id,account.id,now,actorId);
      this.audit('closing.movement_allocate', movement.id, actorId, {accountId:account.id});
      return {movementId:movement.id,accountId:account.id};
    })();
  }
  recordSavingsTransfer(input, actorId) {
    this.requireManager(actorId);
    const account = this.db.prepare('SELECT id,kind,active FROM ClosingAccounts WHERE id=?').get(input?.accountId);
    const amount = Number(input?.amountMinor);
    const at = input?.transferredAt || new Date().toISOString();
    if (!account || account.kind !== 'savings' || !account.active) throw new Error('Choose an active savings account');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Savings transfer must be a positive amount');
    if (Number.isNaN(Date.parse(at)) || Date.parse(at) > Date.now()) throw new Error('Choose a valid transfer time');
    const day=this.db.prepare("SELECT opened_at FROM BusinessDays WHERE status='open'").get();
    if(!day || Date.parse(at)<Date.parse(day.opened_at))throw new Error('Savings transfer must belong to the open business day');
    if(this.db.prepare(`SELECT 1 FROM BusinessDays WHERE status='closed' AND julianday(opened_at)<=julianday(?) AND julianday(closed_at)>julianday(?)`).get(at,at))
      throw new Error('A closed business day cannot accept a backdated savings transfer');
    const reference = String(input?.reference || '').trim();
    if (!reference || reference.length > 120) throw new Error('Actual transfer reference is required');
    if(this.db.prepare('SELECT 1 FROM SavingsTransfers WHERE account_id=? AND reference=? COLLATE NOCASE').get(account.id,reference))
      throw new Error('Savings transfer reference is already recorded for this account');
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      const id = Number(this.db.prepare(`INSERT INTO SavingsTransfers(account_id,amount_minor,transferred_at,reference,recorded_by,created_at)
        VALUES(?,?,?,?,?,?)`).run(account.id,amount,new Date(at).toISOString(),reference,actorId,now).lastInsertRowid);
      this.audit('closing.savings_transfer', id, actorId, {accountId:account.id,amountMinor:amount,transferredAt:new Date(at).toISOString(),reference});
      return {id,accountId:account.id,amountMinor:amount,transferredAt:new Date(at).toISOString(),reference};
    })();
  }
  audit(action, entityId, actorId, next) {
    this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json)
      VALUES(?,?,?,'closing',?,?)`).run(new Date().toISOString(),actorId,action,String(entityId),JSON.stringify(next));
  }
}
module.exports = { ClosingConfigurationService };
