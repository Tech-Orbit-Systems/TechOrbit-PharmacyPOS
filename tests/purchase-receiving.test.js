const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { ProductsRepository } = require("../infrastructure/sqlite/repositories/products");
const { SuppliersRepository } = require("../infrastructure/sqlite/repositories/suppliers");
const { PurchaseReceivingService } = require("../infrastructure/sqlite/services/purchase-receiving");

describe("Purchase receiving", () => {
  let tempDir; let db; let supplier; let product;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-purchase-"));
    db = openDatabase({ filename: path.join(tempDir, "test.sqlite3") });
    supplier = new SuppliersRepository(db).create({ name: "Main Distributor" });
    product = new ProductsRepository(db).create({ name: "Paracetamol", barcode: "10001" });
  });
  afterEach(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });

  test("posts a purchase, batch and matching stock movement atomically", () => {
    const result = new PurchaseReceivingService(db).receive({ supplierId: supplier.id, invoiceNumber: "INV-001",
      purchasedAt: "2026-09-11T10:00:00.000Z", items: [{ productId: product.id, batchNumber: "B-01",
        expiryDate: "2028-12-31", quantity: 10, unitCostMinor: 125, salePriceMinor: 175 }] });
    expect(result.totalMinor).toBe(1250);
    expect(db.prepare("SELECT total_minor, status FROM Purchases").get()).toEqual({ total_minor: 1250, status: "posted" });
    expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches").get().quantity_on_hand).toBe(10);
    expect(db.prepare("SELECT quantity_delta FROM InventoryMovements").get().quantity_delta).toBe(10);
  });

  test("rolls back every write if any item is invalid", () => {
    expect(() => new PurchaseReceivingService(db).receive({ supplierId: supplier.id, items: [
      { productId: product.id, quantity: 5, unitCostMinor: 100, salePriceMinor: 150 },
      { productId: 999999, quantity: 2, unitCostMinor: 100, salePriceMinor: 150 },
    ] })).toThrow();
    for (const table of ["Purchases", "PurchaseItems", "ProductBatches", "InventoryMovements"]) {
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count).toBe(0);
    }
  });

  test("rejects duplicate supplier invoice numbers without partial stock", () => {
    const service = new PurchaseReceivingService(db);
    const input = { supplierId: supplier.id, invoiceNumber: "INV-UNIQUE",
      items: [{ productId: product.id, quantity: 1, unitCostMinor: 100, salePriceMinor: 150 }] };
    service.receive(input);
    expect(() => service.receive(input)).toThrow();
    expect(db.prepare("SELECT count(*) AS count FROM ProductBatches").get().count).toBe(1);
  });
});
