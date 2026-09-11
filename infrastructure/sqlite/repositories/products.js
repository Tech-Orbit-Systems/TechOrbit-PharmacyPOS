const ALLOWED_TAX_STATUS = new Set(["taxable", "exempt"]);

class ProductsRepository {
  constructor(db) { this.db = db; }

  create(product) {
    if (!product?.name?.trim()) throw new Error("Product name is required");
    const taxStatus = product.taxStatus || "exempt";
    const gstRateBasisPoints = taxStatus === "exempt" ? 0 : Number(product.gstRateBasisPoints ?? 0);
    if (!ALLOWED_TAX_STATUS.has(taxStatus)) throw new Error("Invalid tax status");
    if (!Number.isInteger(gstRateBasisPoints) || gstRateBasisPoints < 0 || gstRateBasisPoints > 10000) throw new Error("GST rate must be between 0 and 100 percent");
    const now = new Date().toISOString();
    const result = this.db.prepare(`INSERT INTO Products
      (sku,barcode,name,generic_name,manufacturer,category,product_type,dosage_form,strength,pack_description,base_unit,
       default_sale_price_minor,box_sale_price_minor,strip_sale_price_minor,minimum_stock,reorder_level,default_supplier_id,
       prescription_required,controlled_medicine,gst_rate_basis_points,tax_status,active,notes,created_by,updated_by,created_at,updated_at)
      VALUES (@sku,@barcode,@name,@genericName,@manufacturer,@category,@productType,@dosageForm,@strength,@packDescription,@baseUnit,
       @defaultSalePriceMinor,@boxSalePriceMinor,@stripSalePriceMinor,@minimumStock,@reorderLevel,@defaultSupplierId,
       @prescriptionRequired,@controlledMedicine,@gstRateBasisPoints,@taxStatus,@active,@notes,@createdBy,@updatedBy,@createdAt,@updatedAt)`)
      .run({ sku: product.sku || null, barcode: product.barcode ? String(product.barcode) : null, name: product.name.trim(),
        genericName: product.genericName || null, manufacturer: product.manufacturer || null, category: product.category || null,
        productType: product.productType || "medicine", dosageForm: product.dosageForm || null, strength: product.strength || null,
        packDescription: product.packDescription || null, baseUnit: product.baseUnit || "piece",
        defaultSalePriceMinor: product.defaultSalePriceMinor ?? 0, boxSalePriceMinor: product.boxSalePriceMinor ?? null,
        stripSalePriceMinor: product.stripSalePriceMinor ?? null, minimumStock: product.minimumStock ?? 0,
        reorderLevel: product.reorderLevel ?? 0, defaultSupplierId: product.defaultSupplierId || null,
        prescriptionRequired: product.prescriptionRequired ? 1 : 0, controlledMedicine: product.controlledMedicine ? 1 : 0,
        gstRateBasisPoints, taxStatus, active: product.active === false ? 0 : 1, notes: product.notes || null,
        createdBy: product.createdBy || null, updatedBy: product.createdBy || null, createdAt: now, updatedAt: now });
    return this.findById(result.lastInsertRowid);
  }

  findById(id) { return this.db.prepare("SELECT * FROM Products WHERE id=?").get(id) || null; }
  findByBarcode(barcode) { return this.db.prepare("SELECT * FROM Products WHERE barcode=?").get(String(barcode)) || null; }
  listActive() { return this.db.prepare("SELECT * FROM Products WHERE active=1 ORDER BY name,id").all(); }
  findActiveNameDuplicates(name) {
    return this.db.prepare("SELECT id,name,manufacturer,strength FROM Products WHERE active=1 AND name=? COLLATE NOCASE ORDER BY id").all(name.trim());
  }
  deactivate(id, updatedBy) {
    this.db.prepare("UPDATE Products SET active=0,updated_by=?,updated_at=? WHERE id=?").run(updatedBy || null, new Date().toISOString(), id);
    return this.findById(id);
  }
}

module.exports = { ProductsRepository };
