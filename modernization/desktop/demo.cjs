const bcrypt = require("bcrypt");
const {
  ProductsRepository,
} = require("../../infrastructure/sqlite/repositories/products");
const {
  ProductUnitsRepository,
} = require("../../infrastructure/sqlite/repositories/product-units");
const {
  SalesPostingService,
} = require("../../infrastructure/sqlite/services/sales-posting");
const { dayKey, addDays } = require("./ranges.cjs");
function seedInitial(db) {
  if (db.prepare("SELECT COUNT(*) n FROM Users").get().n) return;
  const now = new Date().toISOString(),
    today = dayKey(now);
  db.prepare(
    "INSERT INTO Users(username,password_hash,display_name,role_id,must_change_password,created_at,updated_at) SELECT 'demo',?,'Demo Pharmacist',id,0,?,? FROM Roles WHERE code='admin'",
  ).run(bcrypt.hashSync("TechOrbit-Demo-2026!", 10), now, now);
  const userId = db
    .prepare("SELECT id FROM Users WHERE username='demo'")
    .get().id;
  const products = [
    ["Panadol 500 mg", "Paracetamol", "Strip", 12000, "0012345678901"],
    ["Cetirizine 10 mg", "Cetirizine", "Strip", 16000, "0012345678902"],
    ["ORS sachet", "Oral rehydration salts", "Sachet", 5000, "0012345678903"],
    ["Amoxicillin 500 mg", "Amoxicillin", "Capsule", 6000, "0012345678904"],
  ];
  for (const [name, genericName, unit, price, barcode] of products) {
    const p = new ProductsRepository(db).create({
      name,
      genericName,
      barcode,
      baseUnit: unit.toLowerCase(),
      defaultSalePriceMinor: price,
      minimumStock: 20,
    });
    new ProductUnitsRepository(db).configure(p.id, [
      {
        unitName: unit,
        baseQuantity: 1,
        sellingPriceMinor: price,
        isDefaultSaleUnit: true,
      },
    ]);
    for (let i = 0; i < 2; i++)
      db.prepare(
        "INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        p.id,
        `B${p.id}0${i}`,
        addDays(today, i === 0 ? 25 : 365),
        Math.round(price * 0.65),
        price,
        5000,
        now,
        now,
        now,
      );
  }
  const customer = db
    .prepare(
      "INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES('Ahmed Khan','03001234567','03001234567',?,?)",
    )
    .run(now, now).lastInsertRowid;
  const supplier = db
    .prepare(
      "INSERT INTO Suppliers(name,phone,created_at,updated_at) VALUES('Demo Medical Distributors','0421234567',?,?)",
    )
    .run(now, now).lastInsertRowid;
  db.prepare(
    "INSERT INTO Payables(supplier_id,source_type,source_id,original_minor,balance_minor,due_date,status,created_at,updated_at) VALUES(?,'demo','1',2100000,2100000,?,'unpaid',?,?)",
  ).run(supplier, addDays(today, 3), now, now);
  const engine = new SalesPostingService(db);
  for (let i = 180; i >= 0; i -= 3) {
    const soldAt = addDays(today, -i) + "T09:00:00.000Z";
    engine.post({
      invoiceNumber: `DEMO-${i}`,
      idempotencyKey: `seed-${i}`,
      soldAt,
      createdBy: userId,
      paymentMethod: i === 3 ? "credit" : "card",
      customerId: i === 3 ? Number(customer) : null,
      dueDate: i === 3 ? addDays(today, -1) : null,
      items: [{ productId: 1, saleUnit: "Strip", quantity: 5 + (i % 11) }],
    });
  }
  db.prepare(
    "INSERT INTO CashShifts(user_id,device_id,opened_at,opening_cash_minor,status,created_at) VALUES(?,'modern-desktop',?,3240000,'open',?)",
  ).run(userId, now, now);
}
function seedDemo(db){seedInitial(db);upgradeDemoUnits(db);}
function upgradeDemoUnits(db){
 const key='review.demoUnits.v2';
 if(db.prepare('SELECT 1 FROM Settings WHERE key=?').get(key))return;
 // Add demo pack choices without changing the stock base, costs or posted history.
 // These ratios are illustrative demo data, never manufacturer defaults for live products.
 db.transaction(()=>{
  const packs=[
   ['0012345678901',[['tablet',0.1,1200],['box',10,120000]]],
   ['0012345678902',[['tablet',0.1,1600],['box',10,160000]]],
   ['0012345678903',[['pack',10,50000],['box',100,500000]]],
   ['0012345678904',[['strip',10,60000],['box',100,600000]]]
  ];
  for(const [barcode,units] of packs){const product=db.prepare('SELECT id FROM Products WHERE barcode=?').get(barcode);if(!product)continue;for(const [name,multiplier,price] of units)db.prepare('INSERT OR IGNORE INTO ProductUnits(product_id,unit_name,base_quantity,selling_price_minor,is_default_sale_unit,allows_fractional_quantity) VALUES(?,?,?,?,0,0)').run(product.id,name,multiplier,price);}
  db.prepare('INSERT INTO Settings(key,value_json,updated_at) VALUES(?,?,?)').run(key,'true',new Date().toISOString());
 })();
}
module.exports = { seedDemo, upgradeDemoUnits };
