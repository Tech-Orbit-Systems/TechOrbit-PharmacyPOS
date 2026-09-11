const fs = require("fs"); const os = require("os"); const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { ProductsRepository } = require("../infrastructure/sqlite/repositories/products");
const { ProductUnitsRepository } = require("../infrastructure/sqlite/repositories/product-units");
describe("Expanded Product Master", () => {
  let dir; let db; let products; let units;
  beforeEach(() => { dir=fs.mkdtempSync(path.join(os.tmpdir(),"techorbit-product-")); db=openDatabase({filename:path.join(dir,"db.sqlite3")}); products=new ProductsRepository(db); units=new ProductUnitsRepository(db); });
  afterEach(() => { db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  test("stores pharmacy, tax, prescription and audit fields", () => {
    const row=products.create({name:"Panadol Extra",genericName:"Paracetamol",manufacturer:"GSK",category:"Analgesic",productType:"medicine",
      dosageForm:"Tablet",strength:"500mg",packDescription:"10 strips x 10 tablets",baseUnit:"tablet",barcode:"0012345",
      defaultSalePriceMinor:1500,boxSalePriceMinor:15000,stripSalePriceMinor:1500,minimumStock:50,reorderLevel:100,
      prescriptionRequired:true,controlledMedicine:false,taxStatus:"taxable",gstRateBasisPoints:1800,notes:"Keep dry"});
    expect(row).toMatchObject({generic_name:"Paracetamol",manufacturer:"GSK",base_unit:"tablet",barcode:"0012345",
      prescription_required:1,controlled_medicine:0,tax_status:"taxable",gst_rate_basis_points:1800,reorder_level:100});
  });
  test("forces exempt GST to zero and warns through duplicate-name query", () => {
    const first=products.create({name:"Same Name",taxStatus:"exempt",gstRateBasisPoints:1800}); products.create({name:"same name"});
    expect(first.gst_rate_basis_points).toBe(0); expect(products.findActiveNameDuplicates("SAME NAME")).toHaveLength(2);
    products.deactivate(first.id); expect(products.findActiveNameDuplicates("same name")).toHaveLength(1);
  });
  test("configures conversions and preserves fractional policy", () => {
    const product=products.create({name:"Loose Tablets",baseUnit:"tablet"});
    units.configure(product.id,[{unitName:"box",baseQuantity:100,sellingPriceMinor:10000},{unitName:"strip",baseQuantity:10,sellingPriceMinor:1100,isDefaultSaleUnit:true},{unitName:"tablet",baseQuantity:1,sellingPriceMinor:120,allowsFractionalQuantity:false}]);
    expect(units.toBaseQuantity(product.id,"strip",2)).toBe(20);
    expect(()=>units.toBaseQuantity(product.id,"tablet",1.5)).toThrow("Fractional");
    expect(()=>units.configure(product.id,[{unitName:"tablet",baseQuantity:1}])).toThrow("Exactly one");
  });
  test("preserves leading zero barcode and enforces uniqueness", () => {
    products.create({name:"A",barcode:"000123"}); expect(products.findByBarcode("000123").name).toBe("A");
    expect(()=>products.create({name:"B",barcode:"000123"})).toThrow();
  });
});
