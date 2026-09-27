const crypto = require('crypto');
const METHODS = new Set(['cash', 'card', 'digital', 'bank_transfer', 'mobile_wallet', 'other']);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const number = (value, label) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw Error(`Choose a valid ${label}`);
  return n;
};

class CustomerReturnsService {
  constructor(db) { this.db = db; this.transaction = db.transaction(input => this.postInternal(input)); }

  normalize(input) {
    const saleId = number(input?.saleId, 'invoice');
    const reason = String(input.reason || '').trim();
    if (!reason || reason.length > 500) throw Error('Return reason is required and must be 500 characters or fewer');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw Error('Choose return lines');
    const seen = new Set();
    const items = input.items.map(row => {
      const saleItemId = number(row.saleItemId, 'sale line');
      const baseQuantity = Number(row.baseQuantity);
      if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) throw Error('Return quantity must be greater than zero');
      if (seen.has(saleItemId)) throw Error('Return line is repeated');
      seen.add(saleItemId);
      if (typeof row.restockable !== 'boolean') throw Error('Choose whether each return is suitable for resale');
      if (row.restockable && row.conditionConfirmed !== true) throw Error('Confirm unopened and suitable condition before restocking');
      return { saleItemId, baseQuantity, restockable: row.restockable, conditionConfirmed: row.conditionConfirmed === true };
    }).sort((a, b) => a.saleItemId - b.saleItemId);
    const refundMethod = input.refundMethod || null;
    return { saleId, reason, items, refundMethod, idempotencyKey: String(input.idempotencyKey || '').trim(), returnedAt: input.returnedAt || null,
      createdBy: input.createdBy || null, roleCode: input.roleCode || null, deviceId: input.deviceId || null };
  }

  preview(input) {
    const data = this.normalize(input);
    const sale = this.db.prepare("SELECT * FROM Sales WHERE id=? AND status='posted'").get(data.saleId);
    if (!sale) throw Error('Posted invoice was not found');
    const at = data.returnedAt || new Date().toISOString();
    if (Number.isNaN(Date.parse(at)) || Date.parse(at) < Date.parse(sale.sold_at)) throw Error('Return date must be valid and not before the sale');
    const allLines = this.db.prepare('SELECT id,base_quantity,line_total_minor,gst_minor,cogs_minor FROM SaleItems WHERE sale_id=? ORDER BY line_number').all(sale.id);
    let cumulative = 0;
    const rounding = new Map();
    for (const line of allLines) {
      const next = cumulative + Number(line.line_total_minor);
      const start = Number(sale.exact_total_minor) ? Math.round(Number(sale.rounding_minor) * cumulative / Number(sale.exact_total_minor)) : 0;
      const end = Number(sale.exact_total_minor) ? Math.round(Number(sale.rounding_minor) * next / Number(sale.exact_total_minor)) : 0;
      rounding.set(line.id, end - start);
      cumulative = next;
    }
    const lines = data.items.map(request => {
      const line = allLines.find(x => x.id === request.saleItemId);
      if (!line) throw Error('Return line does not belong to this invoice');
      const prior = Number(this.db.prepare('SELECT COALESCE(SUM(base_quantity),0) qty FROM SaleReturnItems WHERE sale_item_id=?').get(line.id).qty);
      if (prior + request.baseQuantity > Number(line.base_quantity) + 1e-9) throw Error('Return exceeds sold quantity');
      const fraction = value => Math.round(value * (prior + request.baseQuantity) / Number(line.base_quantity)) - Math.round(value * prior / Number(line.base_quantity));
      const allocations = this.db.prepare('SELECT a.id,a.batch_id,a.base_quantity,b.expiry_date,b.batch_number FROM SaleItemAllocations a JOIN ProductBatches b ON b.id=a.batch_id WHERE a.sale_item_id=? ORDER BY a.id').all(line.id);
      let needed = request.baseQuantity;
      const selected = [];
      for (const allocation of allocations) {
        const previously = Number(this.db.prepare('SELECT COALESCE(SUM(base_quantity),0) qty FROM SaleReturnAllocations WHERE sale_item_allocation_id=?').get(allocation.id).qty);
        const take = Math.min(needed, Number(allocation.base_quantity) - previously);
        if (take <= 0) continue;
        if (request.restockable && allocation.expiry_date && allocation.expiry_date <= localDay()) throw Error('Expired original batch cannot return to sellable stock');
        selected.push({ allocationId: allocation.id, batchId: allocation.batch_id, batchNumber: allocation.batch_number, baseQuantity: take });
        needed -= take;
        if (needed <= 1e-9) break;
      }
      if (needed > 1e-9) throw Error('Original batch allocation is incomplete');
      return { saleItemId: line.id, baseQuantity: request.baseQuantity, restockable: request.restockable, allocations: selected,
        totalMinor: fraction(Number(line.line_total_minor) + (rounding.get(line.id) || 0)), gstMinor: fraction(Number(line.gst_minor)), cogsMinor: fraction(Number(line.cogs_minor)) };
    });
    const totalMinor = lines.reduce((sum, row) => sum + row.totalMinor, 0);
    const receivable = this.db.prepare("SELECT id,balance_minor FROM Receivables WHERE source_type='sale' AND source_id=?").get(String(sale.id));
    const receivableCreditMinor = Math.min(totalMinor, Number(receivable?.balance_minor || 0));
    const refundMinor = totalMinor - receivableCreditMinor;
    return { ...data, invoiceNumber: sale.invoice_number, lines, totalMinor, receivableCreditMinor, refundMinor, returnedAt: at, receivableId: receivable?.id || null };
  }

  post(input) {
    const data = this.normalize(input);
    if (!/^TO-[a-f0-9-]{36}$/.test(data.idempotencyKey)) throw Error('Invalid return reference');
    const fingerprint = hash({ saleId: data.saleId, reason: data.reason, items: data.items, refundMethod: data.refundMethod, returnedAt: data.returnedAt });
    const old = this.db.prepare('SELECT * FROM SaleReturns WHERE idempotency_key=?').get(data.idempotencyKey);
    if (old) {
      if (!old.request_fingerprint || old.request_fingerprint !== fingerprint) throw Error('Return reference was already used with different details');
      return { ...this.result(old), idempotent: true };
    }
    return this.transaction({ ...data, fingerprint });
  }

  postInternal(data) {
    const quote = this.preview(data);
    if (quote.refundMinor > 0 && !METHODS.has(quote.refundMethod)) throw Error('Select the actual refund method');
    const now = new Date().toISOString();
    const id = Number(this.db.prepare(`INSERT INTO SaleReturns(sale_id,customer_id,idempotency_key,returned_at,total_minor,receivable_credit_minor,refund_minor,refund_method,reason,created_by,created_at,request_fingerprint)
      VALUES(?,(SELECT customer_id FROM Sales WHERE id=?),?,?,?,?,?,?,?,?,?,?)`).run(data.saleId, data.saleId, data.idempotencyKey, quote.returnedAt, quote.totalMinor, quote.receivableCreditMinor, quote.refundMinor, quote.refundMethod, data.reason, data.createdBy, now, data.fingerprint).lastInsertRowid);
    for (const line of quote.lines) {
      const source = this.db.prepare('SELECT product_id FROM SaleItems WHERE id=?').get(line.saleItemId);
      const returnItemId = Number(this.db.prepare('INSERT INTO SaleReturnItems(sale_return_id,sale_item_id,product_id,base_quantity,refund_minor,cogs_minor,restockable,gst_minor) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, line.saleItemId, source.product_id, line.baseQuantity, line.totalMinor, line.cogsMinor, line.restockable ? 1 : 0, line.gstMinor).lastInsertRowid);
      for (const allocation of line.allocations) {
        this.db.prepare('INSERT INTO SaleReturnAllocations(sale_return_item_id,sale_item_allocation_id,batch_id,base_quantity) VALUES(?,?,?,?)').run(returnItemId, allocation.allocationId, allocation.batchId, allocation.baseQuantity);
        this.db.prepare('UPDATE ProductBatches SET quantity_on_hand=quantity_on_hand+?,disposed_quantity=disposed_quantity+?,updated_at=? WHERE id=?')
          .run(line.restockable ? allocation.baseQuantity : 0, line.restockable ? 0 : allocation.baseQuantity, now, allocation.batchId);
        this.db.prepare("INSERT INTO InventoryMovements(product_id,batch_id,movement_type,quantity_delta,reference_type,reference_id,occurred_at,user_id,note) VALUES(?,?,'sale_return',?,'sale_return',?,?,?,?)")
          .run(source.product_id, allocation.batchId, allocation.baseQuantity, String(id), quote.returnedAt, data.createdBy, data.reason);
        if (!line.restockable) this.db.prepare("INSERT INTO InventoryMovements(product_id,batch_id,movement_type,quantity_delta,reference_type,reference_id,occurred_at,user_id,note) VALUES(?,?,'adjustment',?,'sale_return_disposal',?,?,?,?)")
          .run(source.product_id, allocation.batchId, -allocation.baseQuantity, String(id), quote.returnedAt, data.createdBy, 'Non-sellable customer return: ' + data.reason);
      }
    }
    if (quote.receivableCreditMinor) {
      const balance = Number(this.db.prepare('SELECT balance_minor FROM Receivables WHERE id=?').get(quote.receivableId).balance_minor) - quote.receivableCreditMinor;
      const status = balance === 0 ? 'paid' : 'partial';
      this.db.prepare('UPDATE Receivables SET balance_minor=?,status=?,updated_at=? WHERE id=?').run(balance, status, now, quote.receivableId);
      this.db.prepare('UPDATE Sales SET balance_due_minor=?,payment_status=? WHERE id=?').run(balance, status, data.saleId);
    }
    if (quote.refundMinor) require('./money-movement').recordMoneyMovement(this.db,{direction:'out',method:quote.refundMethod,amountMinor:quote.refundMinor,referenceType:'sale_return',referenceId:id,occurredAt:quote.returnedAt,userId:data.createdBy,deviceId:data.deviceId,note:data.reason});
    this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,new_json,reason,device_id) VALUES(?,?,?,'sale.return','sale_return',?,?,?,?)")
      .run(now, data.createdBy, data.roleCode, String(id), JSON.stringify({ saleId: data.saleId, totalMinor: quote.totalMinor, gstMinor: quote.lines.reduce((s, x) => s + x.gstMinor, 0), receivableCreditMinor: quote.receivableCreditMinor, refundMinor: quote.refundMinor, nonSellableLines: quote.lines.filter(x => !x.restockable).length }), data.reason, data.deviceId);
    return { ...this.result(this.db.prepare('SELECT * FROM SaleReturns WHERE id=?').get(id)), idempotent: false };
  }

  result(row) { return { returnId: Number(row.id), saleId: Number(row.sale_id), totalMinor: Number(row.total_minor), receivableCreditMinor: Number(row.receivable_credit_minor), refundMinor: Number(row.refund_minor) }; }
}

module.exports = { CustomerReturnsService };
