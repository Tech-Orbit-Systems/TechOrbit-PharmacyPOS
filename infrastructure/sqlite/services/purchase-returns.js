const crypto = require('crypto');
const METHODS = new Set(['cash', 'card', 'digital', 'bank_transfer', 'mobile_wallet', 'other']);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (value, label) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw Error(`Choose a valid ${label}`);
  return n;
};

class PurchaseReturnsService {
  constructor(db) { this.db = db; this.transaction = db.transaction(input => this.postInternal(input)); }

  normalize(input) {
    const purchaseId = id(input?.purchaseId, 'purchase');
    const reason = String(input.reason || '').trim();
    if (!reason || reason.length > 500) throw Error('Return reason is required and must be 500 characters or fewer');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw Error('Choose return lines');
    const seen = new Set();
    const items = input.items.map(row => {
      const purchaseItemId = id(row.purchaseItemId, 'purchase line');
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw Error('Return quantity must be greater than zero');
      if (seen.has(purchaseItemId)) throw Error('Return line is repeated');
      seen.add(purchaseItemId);
      return { purchaseItemId, quantity };
    }).sort((a, b) => a.purchaseItemId - b.purchaseItemId);
    return { purchaseId, reason, items, refundMethod: input.refundMethod || null,
      idempotencyKey: String(input.idempotencyKey || '').trim(), returnedAt: input.returnedAt || null,
      createdBy: input.createdBy || null, roleCode: input.roleCode || null, deviceId: input.deviceId || null };
  }

  preview(input) {
    const data = this.normalize(input);
    const purchase = this.db.prepare("SELECT * FROM Purchases WHERE id=? AND status='posted'").get(data.purchaseId);
    if (!purchase) throw Error('Posted purchase was not found');
    const at = data.returnedAt || new Date().toISOString();
    if (Number.isNaN(Date.parse(at)) || Date.parse(at) < Date.parse(purchase.purchased_at)) throw Error('Return date must be valid and not before the purchase');
    const lines = data.items.map(request => {
      const line = this.db.prepare('SELECT * FROM PurchaseItems WHERE id=? AND purchase_id=?').get(request.purchaseItemId, purchase.id);
      if (!line) throw Error('Return line does not belong to this purchase');
      const prior = Number(this.db.prepare('SELECT COALESCE(SUM(quantity),0) qty FROM PurchaseReturnItems WHERE purchase_item_id=?').get(line.id).qty);
      if (prior + request.quantity > Number(line.base_quantity_received) + 1e-9) throw Error('Return exceeds received quantity');
      const batch = this.db.prepare('SELECT quantity_on_hand,batch_number FROM ProductBatches WHERE id=?').get(line.batch_id);
      if (!batch || request.quantity > Number(batch.quantity_on_hand)) throw Error('Return exceeds current batch stock');
      const source = this.db.prepare('SELECT purchase_id FROM BatchReceipts WHERE id=? AND batch_id=?').get(line.receipt_id, line.batch_id);
      if (!source || Number(source.purchase_id) !== Number(purchase.id)) throw Error('Purchase line has no verified source receipt');
      const mixed = this.db.prepare('SELECT COUNT(*) count FROM BatchReceipts WHERE batch_id=? AND (purchase_id IS NULL OR purchase_id<>?)').get(line.batch_id, purchase.id).count;
      if (mixed) throw Error('Batch stock combines sources; reconcile source stock before supplier return');
      const totalMinor = Math.round(Number(line.line_total_minor) * (prior + request.quantity) / Number(line.base_quantity_received))
        - Math.round(Number(line.line_total_minor) * prior / Number(line.base_quantity_received));
      return { purchaseItemId: line.id, productId: line.product_id, batchId: line.batch_id, batchNumber: batch.batch_number,
        quantity: request.quantity, remainingQuantity: Number(line.base_quantity_received) - prior, totalMinor };
    });
    const byBatch = new Map();
    for (const line of lines) byBatch.set(line.batchId, (byBatch.get(line.batchId) || 0) + line.quantity);
    for (const [batchId, requested] of byBatch) {
      const available = Number(this.db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batchId).quantity_on_hand);
      if (requested > available + 1e-9) throw Error('Combined return exceeds current batch stock');
    }
    const totalMinor = lines.reduce((sum, row) => sum + row.totalMinor, 0);
    const payable = this.db.prepare("SELECT id,balance_minor FROM Payables WHERE source_type='purchase' AND source_id=?").get(String(purchase.id));
    const payableCreditMinor = Math.min(totalMinor, Number(payable?.balance_minor || 0));
    const refundMinor = totalMinor - payableCreditMinor;
    return { ...data, invoiceNumber: purchase.invoice_number, lines, totalMinor, payableCreditMinor, refundMinor, payableId: payable?.id || null, returnedAt: at };
  }

  post(input) {
    const data = this.normalize(input);
    if (!/^TO-[a-f0-9-]{36}$/.test(data.idempotencyKey)) throw Error('Invalid return reference');
    const fingerprint = hash({ purchaseId: data.purchaseId, reason: data.reason, items: data.items, refundMethod: data.refundMethod, returnedAt: data.returnedAt });
    const old = this.db.prepare('SELECT * FROM PurchaseReturns WHERE idempotency_key=?').get(data.idempotencyKey);
    if (old) {
      if (!old.request_fingerprint || old.request_fingerprint !== fingerprint) throw Error('Return reference was already used with different details');
      return { ...this.result(old), idempotent: true };
    }
    return this.transaction({ ...data, fingerprint });
  }

  postInternal(data) {
    const quote = this.preview(data);
    if (quote.refundMinor > 0 && !METHODS.has(quote.refundMethod)) throw Error('Select the actual supplier refund method');
    const now = new Date().toISOString();
    const supplierId = this.db.prepare('SELECT supplier_id FROM Purchases WHERE id=?').get(data.purchaseId).supplier_id;
    const id = Number(this.db.prepare(`INSERT INTO PurchaseReturns(purchase_id,supplier_id,idempotency_key,returned_at,total_minor,payable_credit_minor,refund_minor,refund_method,reason,created_by,created_at,request_fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.purchaseId, supplierId, data.idempotencyKey, quote.returnedAt, quote.totalMinor, quote.payableCreditMinor, quote.refundMinor, quote.refundMethod, data.reason, data.createdBy, now, data.fingerprint).lastInsertRowid);
    for (const line of quote.lines) {
      this.db.prepare('INSERT INTO PurchaseReturnItems(purchase_return_id,purchase_item_id,product_id,batch_id,quantity,unit_cost_minor,line_total_minor) VALUES(?,?,?,?,?,?,?)')
        .run(id, line.purchaseItemId, line.productId, line.batchId, line.quantity, Math.round(line.totalMinor / line.quantity), line.totalMinor);
      const updated = this.db.prepare('UPDATE ProductBatches SET quantity_on_hand=quantity_on_hand-?,updated_at=? WHERE id=? AND quantity_on_hand>=?')
        .run(line.quantity, now, line.batchId, line.quantity);
      if (updated.changes !== 1) throw Error('Batch stock changed before supplier return could post');
      this.db.prepare("INSERT INTO InventoryMovements(product_id,batch_id,movement_type,quantity_delta,reference_type,reference_id,occurred_at,user_id,note) VALUES(?,?,'purchase_return',?,'purchase_return',?,?,?,?)")
        .run(line.productId, line.batchId, -line.quantity, String(id), quote.returnedAt, data.createdBy, data.reason);
    }
    if (quote.payableCreditMinor) {
      const balance = Number(this.db.prepare('SELECT balance_minor FROM Payables WHERE id=?').get(quote.payableId).balance_minor) - quote.payableCreditMinor;
      this.db.prepare('UPDATE Payables SET balance_minor=?,status=?,updated_at=? WHERE id=?').run(balance, balance === 0 ? 'paid' : 'partial', now, quote.payableId);
      this.db.prepare('UPDATE Purchases SET balance_due_minor=? WHERE id=?').run(balance, data.purchaseId);
    }
    if (quote.refundMinor) require('./money-movement').recordMoneyMovement(this.db,{direction:'in',method:quote.refundMethod,amountMinor:quote.refundMinor,referenceType:'purchase_return',referenceId:id,occurredAt:quote.returnedAt,userId:data.createdBy,deviceId:data.deviceId,note:data.reason});
    this.db.prepare("INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,new_json,reason,device_id) VALUES(?,?,?,'purchase.return','purchase_return',?,?,?,?)")
      .run(now, data.createdBy, data.roleCode, String(id), JSON.stringify({ purchaseId: data.purchaseId, totalMinor: quote.totalMinor, payableCreditMinor: quote.payableCreditMinor, refundMinor: quote.refundMinor }), data.reason, data.deviceId);
    return { ...this.result(this.db.prepare('SELECT * FROM PurchaseReturns WHERE id=?').get(id)), idempotent: false };
  }

  result(row) { return { returnId: Number(row.id), purchaseId: Number(row.purchase_id), totalMinor: Number(row.total_minor), payableCreditMinor: Number(row.payable_credit_minor), refundMinor: Number(row.refund_minor) }; }
}

module.exports = { PurchaseReturnsService };
