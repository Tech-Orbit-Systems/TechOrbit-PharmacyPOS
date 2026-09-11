class ProductsRepository {
  constructor(db) {
    this.db = db;
  }

  create(product) {
    if (!product?.name?.trim()) throw new Error("Product name is required");
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO Products (sku, barcode, name, category, default_sale_price_minor, minimum_stock, active, created_at, updated_at)
      VALUES (@sku, @barcode, @name, @category, @defaultSalePriceMinor, @minimumStock, @active, @createdAt, @updatedAt)
    `).run({
      sku: product.sku || null,
      barcode: product.barcode || null,
      name: product.name.trim(),
      category: product.category || null,
      defaultSalePriceMinor: product.defaultSalePriceMinor ?? 0,
      minimumStock: product.minimumStock ?? 0,
      active: product.active === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return this.db.prepare("SELECT * FROM Products WHERE id = ?").get(id) || null;
  }

  findByBarcode(barcode) {
    return this.db.prepare("SELECT * FROM Products WHERE barcode = ?").get(String(barcode)) || null;
  }

  listActive() {
    return this.db.prepare("SELECT * FROM Products WHERE active = 1 ORDER BY name, id").all();
  }
}

module.exports = { ProductsRepository };
