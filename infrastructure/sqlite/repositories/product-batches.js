class ProductBatchesRepository {
  constructor(db) {
    this.db = db;
  }

  create(batch) {
    if (!batch?.productId) throw new Error("Product ID is required");
    if (batch.quantityOnHand == null || Number(batch.quantityOnHand) < 0) {
      throw new Error("Batch quantity must be zero or greater");
    }
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO ProductBatches (
        product_id, supplier_id, batch_number, expiry_date, unit_cost_minor,
        sale_price_minor, quantity_on_hand, received_at, created_at, updated_at
      ) VALUES (
        @productId, @supplierId, @batchNumber, @expiryDate, @unitCostMinor,
        @salePriceMinor, @quantityOnHand, @receivedAt, @createdAt, @updatedAt
      )
    `).run({
      productId: batch.productId,
      supplierId: batch.supplierId || null,
      batchNumber: batch.batchNumber || null,
      expiryDate: batch.expiryDate || null,
      unitCostMinor: batch.unitCostMinor ?? 0,
      salePriceMinor: batch.salePriceMinor ?? 0,
      quantityOnHand: batch.quantityOnHand,
      receivedAt: batch.receivedAt || now,
      createdAt: now,
      updatedAt: now,
    });
    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return this.db.prepare("SELECT * FROM ProductBatches WHERE id = ?").get(id) || null;
  }

  listSellableFefo(productId, asOfDate) {
    return this.db.prepare(`
      SELECT * FROM ProductBatches
      WHERE product_id = ?
        AND quantity_on_hand > 0
        AND (expiry_date IS NULL OR expiry_date > ?)
      ORDER BY expiry_date IS NULL, expiry_date, received_at, id
    `).all(productId, asOfDate);
  }
}

module.exports = { ProductBatchesRepository };
