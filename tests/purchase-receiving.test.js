const fs = require("fs"); const os = require("os"); const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { ProductsRepository } = require("../infrastructure/sqlite/repositories/products");
const { SuppliersRepository } = require("../infrastructure/sqlite/repositories/suppliers");
const { PurchaseReceivingService } = require("../infrastructure/sqlite/services/purchase-receiving");

describe("Complete purchase receiving", () => {
  let dir; let db; let supplier; let product;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-purchase-v2-")); db = openDatabase({ filename: path.join(dir, "db.sqlite3") });
    supplier = new SuppliersRepository(db).create({ name: "Main Distributor" });
    product = new ProductsRepository(db).create({ name: "Paracetamol" });
    db.prepare("INSERT INTO ProductUnits(product_id,unit_name,base_quantity,selling_price_minor,is_default_sale_unit) VALUES (?, 'box', 100, 15000, 1)").run(product.id);
  });
  afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const item = () => ({ productId: product.id, purchaseUnit: "box", batchNumber: "B-01", expiryDate: "09/2028",
    purchasedQuantity: 10, bonusQuantity: 1, unitCostMinor: 10000, salePriceMinor: 150 });

  test("converts units, separates bonus and calculates effective cost", () => {
    const result = new PurchaseReceivingService(db).receive({ supplierId: supplier.id, idempotencyKey: "purchase-1",
      invoiceNumber: "INV-1", paymentMethod: "cash", items: [item()] });
    expect(result).toMatchObject({ totalMinor: 100000, amountPaidMinor: 100000, balanceDueMinor: 0 });
    expect(result.items[0]).toMatchObject({ purchasedBaseQuantity: 1000, bonusBaseQuantity: 100, baseQuantityReceived: 1100, effectiveUnitCostMinor: 91 });
    expect(db.prepare("SELECT quantity_on_hand,purchased_quantity,bonus_quantity FROM ProductBatches").get())
      .toEqual({ quantity_on_hand: 1100, purchased_quantity: 1000, bonus_quantity: 100 });
    expect(db.prepare("SELECT count(*) count FROM BatchReceipts").get().count).toBe(1);
    expect(db.prepare("SELECT amount_minor FROM MoneyMovements").get().amount_minor).toBe(100000);
    expect(db.prepare("SELECT count(*) count FROM AuditLog WHERE action='purchase.post'").get().count).toBe(1);
  });

  test("creates payable only for remaining balance", () => {
    const result = new PurchaseReceivingService(db).receive({ supplierId: supplier.id, idempotencyKey: "purchase-2",
      purchasedAt: "2026-09-11T10:00:00Z", paymentMethod: "credit", amountPaidMinor: 25000,
      dueDate: "2026-10-11", items: [item()] });
    expect(result.balanceDueMinor).toBe(75000);
    expect(db.prepare("SELECT original_minor,balance_minor,status FROM Payables").get())
      .toEqual({ original_minor: 75000, balance_minor: 75000, status: "partial" });
    expect(db.prepare("SELECT amount_minor FROM MoneyMovements").get().amount_minor).toBe(25000);
  });

  test("reuses a physical batch but creates separate purchase receipt lots", () => {
    const service = new PurchaseReceivingService(db);
    service.receive({ supplierId: supplier.id, idempotencyKey: "repeat-1", items: [item()] });
    service.receive({ supplierId: supplier.id, idempotencyKey: "repeat-2", items: [item()] });
    expect(db.prepare("SELECT count(*) count FROM ProductBatches").get().count).toBe(1);
    expect(db.prepare("SELECT count(*) count FROM BatchReceipts").get().count).toBe(2);
    expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches").get().quantity_on_hand).toBe(2200);
  });

  test("blocks duplicate submission and invalid due date without partial writes", () => {
    const service = new PurchaseReceivingService(db);
    service.receive({ supplierId: supplier.id, idempotencyKey: "same-key", items: [item()] });
    expect(() => service.receive({ supplierId: supplier.id, idempotencyKey: "same-key", items: [item()] })).toThrow();
    expect(() => service.receive({ supplierId: supplier.id, idempotencyKey: "bad-due", purchasedAt: "2026-09-11T00:00:00Z",
      paymentMethod: "credit", dueDate: "2026-09-10", items: [item()] })).toThrow("Due date cannot");
    expect(db.prepare("SELECT count(*) count FROM Purchases").get().count).toBe(1);
  });

  test("requires batch and valid expiry for medicines", () => {
    const invalid = item(); invalid.batchNumber = "";
    expect(() => new PurchaseReceivingService(db).receive({ supplierId: supplier.id, idempotencyKey: "missing-batch", items: [invalid] })).toThrow("Batch number");
    invalid.batchNumber = "B"; invalid.expiryDate = "invalid";
    expect(() => new PurchaseReceivingService(db).receive({ supplierId: supplier.id, idempotencyKey: "bad-expiry", items: [invalid] })).toThrow("Valid expiry");
  });
});
