const { normalizeExpiry } = require("../../domain/utils");

const PAYMENT_METHODS = new Set(["cash", "card", "bank_transfer", "mobile_wallet", "other", "credit"]);

class PurchaseReceivingService {
  constructor(db) {
    this.db = db;
    this.receiveTransaction = db.transaction((purchase) => this.receiveInternal(purchase));
  }

  receive(purchase) {
    if (!purchase?.supplierId) throw new Error("Supplier ID is required");
    if (!purchase.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) throw new Error("At least one purchase item is required");
    return this.receiveTransaction(purchase);
  }

  receiveInternal(purchase) {
    const purchasedAt = purchase.purchasedAt || new Date().toISOString();
    const purchaseDate = purchasedAt.slice(0, 10);
    const paymentMethod = purchase.paymentMethod || "cash";
    if (!PAYMENT_METHODS.has(paymentMethod)) throw new Error("Unsupported payment method");
    const items = purchase.items.map((item) => this.normalizeItem(item));
    const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const amountPaidMinor = purchase.amountPaidMinor == null
      ? (paymentMethod === "credit" ? 0 : totalMinor)
      : Number(purchase.amountPaidMinor);
    if (!Number.isInteger(amountPaidMinor) || amountPaidMinor < 0 || amountPaidMinor > totalMinor) {
      throw new Error("Amount paid must be between zero and purchase total");
    }
    const balanceDueMinor = totalMinor - amountPaidMinor;
    if (balanceDueMinor > 0) {
      if (!purchase.dueDate) throw new Error("Due date is required when a balance remains");
      if (purchase.dueDate < purchaseDate) throw new Error("Due date cannot be earlier than purchase date");
    }
    const now = new Date().toISOString();
    const purchaseResult = this.db.prepare(`INSERT INTO Purchases
      (supplier_id, invoice_number, purchased_at, total_minor, status, created_by, created_at,
       idempotency_key, amount_paid_minor, balance_due_minor, payment_method, due_date, notes)
      VALUES (?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      purchase.supplierId, purchase.invoiceNumber || null, purchasedAt, totalMinor, purchase.createdBy || null, now,
      purchase.idempotencyKey.trim(), amountPaidMinor, balanceDueMinor, paymentMethod, purchase.dueDate || null, purchase.notes || null);
    const purchaseId = Number(purchaseResult.lastInsertRowid);
    const receivedItems = items.map((item) => this.receiveItem({ item, purchase, purchaseId, purchasedAt, now }));
    if (amountPaidMinor > 0) {
      this.db.prepare(`INSERT INTO MoneyMovements
        (direction, method, amount_minor, reference_type, reference_id, occurred_at, user_id, note)
        VALUES ('out', ?, ?, 'purchase', ?, ?, ?, ?)`).run(
        paymentMethod, amountPaidMinor, String(purchaseId), purchasedAt, purchase.createdBy || null, "Purchase payment");
    }
    if (balanceDueMinor > 0) {
      this.db.prepare(`INSERT INTO Payables
        (supplier_id, source_type, source_id, original_minor, balance_minor, due_date, status, created_at, updated_at)
        VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?, ?)`).run(
        purchase.supplierId, String(purchaseId), balanceDueMinor, balanceDueMinor, purchase.dueDate,
        amountPaidMinor > 0 ? "partial" : "unpaid", now, now);
    }
    this.db.prepare(`INSERT INTO AuditLog
      (occurred_at, user_id, role_code, action, entity_type, entity_id, new_json, reason, device_id)
      VALUES (?, ?, ?, 'purchase.post', 'purchase', ?, ?, ?, ?)`).run(
      now, purchase.createdBy || null, purchase.roleCode || null, String(purchaseId),
      JSON.stringify({ totalMinor, amountPaidMinor, balanceDueMinor, itemCount: items.length }),
      purchase.reason || null, purchase.deviceId || null);
    return { purchaseId, totalMinor, amountPaidMinor, balanceDueMinor, items: receivedItems };
  }

  normalizeItem(item) {
    if (!item.productId) throw new Error("Product ID is required for every item");
    const product = this.db.prepare("SELECT * FROM Products WHERE id = ? AND active = 1").get(item.productId);
    if (!product) throw new Error("Active product was not found");
    const purchaseUnit = item.purchaseUnit || product.base_unit;
    const unit = this.db.prepare("SELECT * FROM ProductUnits WHERE product_id = ? AND unit_name = ? COLLATE NOCASE")
      .get(item.productId, purchaseUnit);
    let unitsPerPurchaseUnit;
    if (unit) unitsPerPurchaseUnit = Number(unit.base_quantity);
    else if (purchaseUnit.toLowerCase() === product.base_unit.toLowerCase()) unitsPerPurchaseUnit = 1;
    else throw new Error(`Purchase unit ${purchaseUnit} is not configured for this product`);
    const purchasedQuantity = Number(item.purchasedQuantity ?? item.quantity);
    const bonusQuantity = Number(item.bonusQuantity ?? 0);
    const unitCostMinor = Number(item.unitCostMinor);
    const salePriceMinor = Number(item.salePriceMinor);
    if (!Number.isFinite(purchasedQuantity) || purchasedQuantity <= 0) throw new Error("Purchased quantity must be greater than zero");
    if (!Number.isFinite(bonusQuantity) || bonusQuantity < 0) throw new Error("Bonus quantity cannot be negative");
    if (!Number.isInteger(unitCostMinor) || unitCostMinor < 0) throw new Error("Unit cost must be a non-negative integer");
    if (!Number.isInteger(salePriceMinor) || salePriceMinor < 0) throw new Error("Sale price must be a non-negative integer");
    const batchNumber = item.batchNumber?.trim() || null;
    const expiryDate = normalizeExpiry(item.expiryDate);
    if (product.product_type === "medicine" && !batchNumber) throw new Error("Batch number is required for medicine products");
    if (product.product_type === "medicine" && !expiryDate) throw new Error("Valid expiry date is required for medicine products");
    const purchasedBaseQuantity = purchasedQuantity * unitsPerPurchaseUnit;
    const bonusBaseQuantity = bonusQuantity * unitsPerPurchaseUnit;
    const baseQuantityReceived = purchasedBaseQuantity + bonusBaseQuantity;
    const lineTotalMinor = Math.round(purchasedQuantity * unitCostMinor);
    const effectiveUnitCostMinor = baseQuantityReceived > 0 ? Math.round(lineTotalMinor / baseQuantityReceived) : 0;
    return { ...item, product, purchaseUnit, unitsPerPurchaseUnit, purchasedQuantity, bonusQuantity,
      purchasedBaseQuantity, bonusBaseQuantity, baseQuantityReceived, unitCostMinor, salePriceMinor,
      lineTotalMinor, effectiveUnitCostMinor, batchNumber, expiryDate };
  }

  receiveItem({ item, purchase, purchaseId, purchasedAt, now }) {
    let batch = this.db.prepare(`SELECT * FROM ProductBatches WHERE product_id=? AND batch_number IS ? AND expiry_date IS ?`)
      .get(item.productId, item.batchNumber, item.expiryDate);
    if (!batch) {
      const result = this.db.prepare(`INSERT INTO ProductBatches
        (product_id, supplier_id, batch_number, expiry_date, unit_cost_minor, sale_price_minor, quantity_on_hand,
         received_at, created_at, updated_at, manufacturing_date, purchased_quantity, bonus_quantity)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 0)`).run(
        item.productId, purchase.supplierId, item.batchNumber, item.expiryDate, item.effectiveUnitCostMinor,
        item.salePriceMinor, purchasedAt, now, now, normalizeExpiry(item.manufacturingDate));
      batch = this.db.prepare("SELECT * FROM ProductBatches WHERE id=?").get(result.lastInsertRowid);
    }
    const oldQty = Number(batch.quantity_on_hand);
    const weightedCost = Math.round(((oldQty * Number(batch.unit_cost_minor)) + item.lineTotalMinor) / (oldQty + item.baseQuantityReceived));
    this.db.prepare(`UPDATE ProductBatches SET quantity_on_hand=quantity_on_hand+?, purchased_quantity=purchased_quantity+?,
      bonus_quantity=bonus_quantity+?, unit_cost_minor=?, sale_price_minor=?, updated_at=? WHERE id=?`).run(
      item.baseQuantityReceived, item.purchasedBaseQuantity, item.bonusBaseQuantity, weightedCost, item.salePriceMinor, now, batch.id);
    const receipt = this.db.prepare(`INSERT INTO BatchReceipts
      (batch_id, purchase_id, supplier_id, purchased_base_quantity, bonus_base_quantity, total_cost_minor,
       effective_unit_cost_minor, received_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      batch.id, purchaseId, purchase.supplierId, item.purchasedBaseQuantity, item.bonusBaseQuantity,
      item.lineTotalMinor, item.effectiveUnitCostMinor, purchasedAt, purchase.createdBy || null, now);
    this.db.prepare(`INSERT INTO PurchaseItems
      (purchase_id, product_id, batch_id, quantity, unit_cost_minor, line_total_minor, receipt_id,
       purchase_unit, units_per_purchase_unit, purchased_quantity, bonus_quantity, base_quantity_received, effective_unit_cost_minor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      purchaseId, item.productId, batch.id, item.baseQuantityReceived, item.unitCostMinor, item.lineTotalMinor,
      receipt.lastInsertRowid, item.purchaseUnit, item.unitsPerPurchaseUnit, item.purchasedQuantity,
      item.bonusQuantity, item.baseQuantityReceived, item.effectiveUnitCostMinor);
    this.db.prepare(`INSERT INTO InventoryMovements
      (product_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, occurred_at, user_id, note)
      VALUES (?, ?, 'purchase', ?, 'purchase', ?, ?, ?, ?)`).run(
      item.productId, batch.id, item.baseQuantityReceived, String(purchaseId), purchasedAt,
      purchase.createdBy || null, purchase.notes || null);
    return { productId: item.productId, batchId: Number(batch.id), receiptId: Number(receipt.lastInsertRowid),
      purchasedBaseQuantity: item.purchasedBaseQuantity, bonusBaseQuantity: item.bonusBaseQuantity,
      baseQuantityReceived: item.baseQuantityReceived, effectiveUnitCostMinor: item.effectiveUnitCostMinor };
  }
}

module.exports = { PurchaseReceivingService };
