class ProductUnitsRepository {
  constructor(db) { this.db = db; }
  configure(productId, units) {
    if (!Array.isArray(units) || units.length === 0) throw new Error("At least one unit is required");
    const defaults = units.filter((unit) => unit.isDefaultSaleUnit);
    if (defaults.length !== 1) throw new Error("Exactly one default sale unit is required");
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM ProductUnits WHERE product_id=?").run(productId);
      const insert = this.db.prepare(`INSERT INTO ProductUnits
        (product_id,unit_name,base_quantity,selling_price_minor,is_default_sale_unit,allows_fractional_quantity)
        VALUES (?,?,?,?,?,?)`);
      for (const unit of units) {
        const baseQuantity = Number(unit.baseQuantity);
        if (!unit.unitName?.trim() || !Number.isFinite(baseQuantity) || baseQuantity <= 0) throw new Error("Every unit needs a name and positive base quantity");
        if (unit.sellingPriceMinor != null && (!Number.isInteger(unit.sellingPriceMinor) || unit.sellingPriceMinor < 0)) throw new Error("Selling price must be non-negative integer minor units");
        insert.run(productId, unit.unitName.trim().toLowerCase(), baseQuantity, unit.sellingPriceMinor ?? null,
          unit.isDefaultSaleUnit ? 1 : 0, unit.allowsFractionalQuantity ? 1 : 0);
      }
      return this.list(productId);
    })();
  }
  list(productId) { return this.db.prepare("SELECT * FROM ProductUnits WHERE product_id=? ORDER BY base_quantity DESC,id").all(productId); }
  toBaseQuantity(productId, unitName, quantity) {
    const unit = this.db.prepare("SELECT * FROM ProductUnits WHERE product_id=? AND unit_name=? COLLATE NOCASE").get(productId, unitName);
    if (!unit) throw new Error("Unit is not configured for this product");
    const entered = Number(quantity);
    if (!Number.isFinite(entered) || entered <= 0) throw new Error("Quantity must be greater than zero");
    if (!unit.allows_fractional_quantity && !Number.isInteger(entered)) throw new Error("Fractional quantity is not allowed for this unit");
    return entered * Number(unit.base_quantity);
  }
}
module.exports = { ProductUnitsRepository };
