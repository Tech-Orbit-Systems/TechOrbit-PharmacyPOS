class ProductCatalogService {
  constructor(db) { this.db = db; }

  findByBarcode(barcode, asOfDate = new Date().toISOString().slice(0, 10)) {
    const value = String(barcode ?? "").trim();
    if (!value) throw new Error("Barcode is required");
    const product = this.db.prepare("SELECT * FROM Products WHERE active=1 AND barcode=?").get(value);
    return product ? this.buildCounterProduct(product, asOfDate) : null;
  }

  search(term, asOfDate = new Date().toISOString().slice(0, 10), limit = 30) {
    const value = String(term ?? "").trim();
    if (!value) throw new Error("Search term is required");
    const boundedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const pattern = `%${value}%`;
    return this.db.prepare(`SELECT * FROM Products WHERE active=1 AND
      (name LIKE ? OR generic_name LIKE ? OR barcode LIKE ? OR sku LIKE ?)
      ORDER BY CASE WHEN barcode=? THEN 0 WHEN sku=? THEN 1 ELSE 2 END,name,id LIMIT ?`)
      .all(pattern,pattern,pattern,pattern,value,value,boundedLimit)
      .map(product=>this.buildCounterProduct(product,asOfDate));
  }

  buildCounterProduct(product, asOfDate) {
    const units=this.db.prepare("SELECT unit_name,base_quantity,selling_price_minor,is_default_sale_unit,allows_fractional_quantity FROM ProductUnits WHERE product_id=? ORDER BY is_default_sale_unit DESC,base_quantity DESC,id").all(product.id);
    const batches=this.db.prepare(`SELECT id,batch_number,expiry_date,quantity_on_hand,unit_cost_minor,sale_price_minor
      FROM ProductBatches WHERE product_id=? AND quantity_on_hand>0 AND (expiry_date IS NULL OR expiry_date>?)
      ORDER BY expiry_date IS NULL,expiry_date,received_at,id`).all(product.id,asOfDate);
    return {id:product.id,sku:product.sku,barcode:product.barcode,name:product.name,genericName:product.generic_name,
      manufacturer:product.manufacturer,strength:product.strength,dosageForm:product.dosage_form,baseUnit:product.base_unit,
      prescriptionRequired:Boolean(product.prescription_required),controlledMedicine:Boolean(product.controlled_medicine),
      taxStatus:product.tax_status,gstRateBasisPoints:product.gst_rate_basis_points,
      sellableBaseQuantity:batches.reduce((sum,batch)=>sum+Number(batch.quantity_on_hand),0),units,batches};
  }
}
module.exports={ProductCatalogService};
