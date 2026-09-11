class PurchaseReceivingService {
  constructor(db) {
    this.db = db;
    this.receiveTransaction = db.transaction((purchase) => this.receiveInternal(purchase));
  }

  receive(purchase) {
    if (!purchase?.supplierId) throw new Error("Supplier ID is required");
    if (!Array.isArray(purchase.items) || purchase.items.length === 0) throw new Error("At least one purchase item is required");
    return this.receiveTransaction(purchase);
  }

  receiveInternal(purchase) {
    const now = purchase.purchasedAt || new Date().toISOString();
    const items = purchase.items.map((item) => {
      const quantity = Number(item.quantity);
      const unitCostMinor = Number(item.unitCostMinor);
      const salePriceMinor = Number(item.salePriceMinor);
      if (!item.productId) throw new Error("Product ID is required for every item");
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Item quantity must be greater than zero");
      if (!Number.isInteger(unitCostMinor) || unitCostMinor < 0) throw new Error("Unit cost must be a non-negative integer");
      if (!Number.isInteger(salePriceMinor) || salePriceMinor < 0) throw new Error("Sale price must be a non-negative integer");
      return { ...item, quantity, unitCostMinor, salePriceMinor, lineTotalMinor: Math.round(quantity * unitCostMinor) };
    });
    const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const purchaseResult = this.db.prepare(`INSERT INTO Purchases
      (supplier_id, invoice_number, purchased_at, total_minor, status, created_by, created_at)
      VALUES (?, ?, ?, ?, 'posted', ?, ?)`).run(
      purchase.supplierId, purchase.invoiceNumber || null, now, totalMinor,
      purchase.createdBy || null, new Date().toISOString());
    const insertBatch = this.db.prepare(`INSERT INTO ProductBatches
      (product_id, supplier_id, batch_number, expiry_date, unit_cost_minor, sale_price_minor,
       quantity_on_hand, received_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertItem = this.db.prepare(`INSERT INTO PurchaseItems
      (purchase_id, product_id, batch_id, quantity, unit_cost_minor, line_total_minor) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertMovement = this.db.prepare(`INSERT INTO InventoryMovements
      (product_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, occurred_at, user_id, note)
      VALUES (?, ?, 'purchase', ?, 'purchase', ?, ?, ?, ?)`);
    const receivedItems = items.map((item) => {
      const createdAt = new Date().toISOString();
      const batch = insertBatch.run(item.productId, purchase.supplierId, item.batchNumber || null,
        item.expiryDate || null, item.unitCostMinor, item.salePriceMinor, item.quantity, now, createdAt, createdAt);
      insertItem.run(purchaseResult.lastInsertRowid, item.productId, batch.lastInsertRowid,
        item.quantity, item.unitCostMinor, item.lineTotalMinor);
      insertMovement.run(item.productId, batch.lastInsertRowid, item.quantity,
        String(purchaseResult.lastInsertRowid), now, purchase.createdBy || null, purchase.note || null);
      return { productId: item.productId, batchId: Number(batch.lastInsertRowid), quantity: item.quantity };
    });
    return { purchaseId: Number(purchaseResult.lastInsertRowid), totalMinor, items: receivedItems };
  }
}

module.exports = { PurchaseReceivingService };
