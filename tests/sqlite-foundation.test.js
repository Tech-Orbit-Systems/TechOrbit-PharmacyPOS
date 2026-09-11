const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { ProductsRepository } = require("../infrastructure/sqlite/repositories/products");
const { SuppliersRepository } = require("../infrastructure/sqlite/repositories/suppliers");
const { ProductBatchesRepository } = require("../infrastructure/sqlite/repositories/product-batches");

describe("SQLite pharmacy foundation", () => {
  let tempDir;
  let db;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-pos-"));
    db = openDatabase({ filename: path.join(tempDir, "test.sqlite3") });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("runs migrations once and enables foreign keys", () => {
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.prepare("SELECT count(*) AS count FROM SchemaMigrations").get().count).toBe(1);
    expect(() => db.exec("PRAGMA wal_checkpoint(TRUNCATE)")).not.toThrow();

    db.close();
    db = openDatabase({ filename: path.join(tempDir, "test.sqlite3") });
    expect(db.prepare("SELECT count(*) AS count FROM SchemaMigrations").get().count).toBe(1);
  });

  test("creates and finds a product by barcode", () => {
    const products = new ProductsRepository(db);
    const created = products.create({
      name: "Paracetamol 500mg",
      barcode: "0896000123456",
      defaultSalePriceMinor: 12500,
      minimumStock: 10,
    });
    expect(products.findByBarcode("0896000123456").id).toBe(created.id);
    expect(created.default_sale_price_minor).toBe(12500);
  });

  test("enforces unique barcodes", () => {
    const products = new ProductsRepository(db);
    products.create({ name: "Product A", barcode: "1001" });
    expect(() => products.create({ name: "Product B", barcode: "1001" })).toThrow();
  });

  test("lists non-expired stock in FEFO order", () => {
    const products = new ProductsRepository(db);
    const suppliers = new SuppliersRepository(db);
    const batches = new ProductBatchesRepository(db);
    const product = products.create({ name: "Amoxicillin 500mg", barcode: "2001" });
    const supplier = suppliers.create({ name: "Test Supplier" });

    batches.create({ productId: product.id, supplierId: supplier.id, batchNumber: "LATE", expiryDate: "2030-12-31", unitCostMinor: 100, salePriceMinor: 150, quantityOnHand: 5 });
    batches.create({ productId: product.id, supplierId: supplier.id, batchNumber: "EARLY", expiryDate: "2029-06-30", unitCostMinor: 100, salePriceMinor: 150, quantityOnHand: 3 });
    batches.create({ productId: product.id, supplierId: supplier.id, batchNumber: "EXPIRED", expiryDate: "2020-01-01", unitCostMinor: 100, salePriceMinor: 150, quantityOnHand: 8 });

    expect(batches.listSellableFefo(product.id, "2026-09-11").map((row) => row.batch_number)).toEqual(["EARLY", "LATE"]);
  });

  test("rejects a batch for a missing product", () => {
    const batches = new ProductBatchesRepository(db);
    expect(() => batches.create({ productId: 999, quantityOnHand: 1 })).toThrow();
  });
});
