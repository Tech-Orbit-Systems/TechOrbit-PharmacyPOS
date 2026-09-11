const crypto = require("crypto");
const fs = require("fs");

function parseNeDb(content) {
  const current = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.$$deleted === true && row._id != null) current.delete(String(row._id));
    else if (!row.$$indexCreated && !row.$$indexRemoved && row._id != null) current.set(String(row._id), row);
  }
  return [...current.values()];
}

function moneyToMinor(value) {
  if (value == null || String(value).trim() === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid price: ${value}`);
  return Math.round((number + Number.EPSILON) * 100);
}

function quantity(value) {
  if (value == null || String(value).trim() === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid quantity: ${value}`);
  return number;
}

function normalizeExpiry(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`))) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function prepareLegacyProducts(rows) {
  const seenBarcodes = new Set(); const warnings = [];
  const products = rows.map((row, index) => {
    if (!String(row.name || "").trim()) throw new Error(`Product at row ${index + 1} has no name`);
    let barcode = row.barcode == null || String(row.barcode).trim() === "" ? null : String(row.barcode).trim();
    if (barcode && seenBarcodes.has(barcode)) { warnings.push(`Duplicate barcode ${barcode} omitted from ${row.name}`); barcode = null; }
    if (barcode) seenBarcodes.add(barcode);
    const expiryDate = normalizeExpiry(row.expirationDate);
    if (row.expirationDate && !expiryDate) warnings.push(`Invalid expiry omitted from ${row.name}`);
    return { legacySourceId: String(row._id), name: String(row.name).trim(), barcode,
      category: row.category ? String(row.category) : null, supplierName: row.supplier ? String(row.supplier).trim() : null,
      salePriceMinor: moneyToMinor(row.price), minimumStock: quantity(row.minStock), openingQuantity: quantity(row.quantity),
      expiryDate, active: row.stock === 1 ? 1 : 0 };
  });
  return { products, warnings };
}

function importPrepared(db, prepared, metadata) {
  return db.transaction(() => {
    if (db.prepare("SELECT id FROM LegacyImports WHERE source_sha256 = ?").get(metadata.sha256)) throw new Error("This legacy inventory file has already been imported");
    const supplierIds = new Map(); const now = new Date().toISOString();
    const findSupplier = db.prepare("SELECT id FROM Suppliers WHERE name = ? COLLATE NOCASE");
    const addSupplier = db.prepare("INSERT INTO Suppliers (name, active, created_at, updated_at) VALUES (?, 1, ?, ?)");
    const addProduct = db.prepare(`INSERT INTO Products (barcode, name, category, default_sale_price_minor, minimum_stock, active, created_at, updated_at, legacy_source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addBatch = db.prepare(`INSERT INTO ProductBatches (product_id, supplier_id, batch_number, expiry_date, unit_cost_minor, sale_price_minor, quantity_on_hand, received_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`);
    const addMovement = db.prepare(`INSERT INTO InventoryMovements (product_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, occurred_at, note) VALUES (?, ?, 'opening', ?, 'legacy_nedb', ?, ?, 'Imported from legacy inventory')`);
    let openingQuantity = 0;
    for (const product of prepared.products) {
      let supplierId = null;
      if (product.supplierName) {
        const key = product.supplierName.toLowerCase(); supplierId = supplierIds.get(key);
        if (!supplierId) { const found = findSupplier.get(product.supplierName); supplierId = found?.id || Number(addSupplier.run(product.supplierName, now, now).lastInsertRowid); supplierIds.set(key, supplierId); }
      }
      const productId = Number(addProduct.run(product.barcode, product.name, product.category, product.salePriceMinor, product.minimumStock, product.active, now, now, product.legacySourceId).lastInsertRowid);
      if (product.openingQuantity > 0) {
        const batchId = Number(addBatch.run(productId, supplierId, `OPENING-${product.legacySourceId}`, product.expiryDate, product.salePriceMinor, product.openingQuantity, now, now, now).lastInsertRowid);
        addMovement.run(productId, batchId, product.openingQuantity, product.legacySourceId, now); openingQuantity += product.openingQuantity;
      }
    }
    db.prepare("INSERT INTO LegacyImports (source_file, source_sha256, imported_at, product_count, opening_quantity) VALUES (?, ?, ?, ?, ?)").run(metadata.sourceFile, metadata.sha256, now, prepared.products.length, openingQuantity);
    return { productCount: prepared.products.length, openingQuantity, supplierCount: supplierIds.size };
  })();
}

function migrateLegacyInventory({ db, sourceFile, commit = false }) {
  const content = fs.readFileSync(sourceFile, "utf8"); const prepared = prepareLegacyProducts(parseNeDb(content));
  const report = { mode: commit ? "commit" : "dry-run", sourceFile, sourceSha256: crypto.createHash("sha256").update(content).digest("hex"),
    productCount: prepared.products.length, openingQuantity: prepared.products.reduce((sum, row) => sum + row.openingQuantity, 0),
    supplierCount: new Set(prepared.products.map((row) => row.supplierName?.toLowerCase()).filter(Boolean)).size, warnings: prepared.warnings };
  if (commit) Object.assign(report, importPrepared(db, prepared, { sourceFile, sha256: report.sourceSha256 }));
  return report;
}
module.exports = { importPrepared, migrateLegacyInventory, moneyToMinor, normalizeExpiry, parseNeDb, prepareLegacyProducts };
