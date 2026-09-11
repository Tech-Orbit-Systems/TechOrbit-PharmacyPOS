const fs=require("fs"); const os=require("os"); const path=require("path");
const {openDatabase}=require("../infrastructure/sqlite/database");
const {ProductsRepository}=require("../infrastructure/sqlite/repositories/products");
const {ProductUnitsRepository}=require("../infrastructure/sqlite/repositories/product-units");
const {SalesPostingService}=require("../infrastructure/sqlite/services/sales-posting");

describe("Atomic sales posting",()=>{
  let dir,db,product,customer;
  beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"techorbit-sale-")); db=openDatabase({filename:path.join(dir,"db.sqlite3")});
    product=new ProductsRepository(db).create({name:"Paracetamol 500mg",genericName:"Paracetamol",baseUnit:"tablet",taxStatus:"taxable",gstRateBasisPoints:1800,prescriptionRequired:true});
    new ProductUnitsRepository(db).configure(product.id,[{unitName:"strip",baseQuantity:10,sellingPriceMinor:1000,isDefaultSaleUnit:true},{unitName:"tablet",baseQuantity:1,sellingPriceMinor:110}]);
    const now=new Date().toISOString(); customer=db.prepare("INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES ('Ali','03001234567','03001234567',?,?)").run(now,now).lastInsertRowid;
    const add=db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    add.run(product.id,"EARLY","2027-01-31",50,110,6,"2026-01-01",now,now); add.run(product.id,"LATE","2028-01-31",60,110,20,"2026-02-01",now,now); add.run(product.id,"EXPIRED","2020-01-01",10,110,50,"2020-01-01",now,now);
  });
  afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  const baseSale=(extra={})=>({invoiceNumber:"INV-100",idempotencyKey:"sale-key-100",soldAt:"2026-09-11T12:00:00Z",paymentMethod:"cash",items:[{productId:product.id,saleUnit:"tablet",quantity:10}],...extra});

  test("allocates FEFO across batches and records COGS and stock movements",()=>{const result=new SalesPostingService(db).post(baseSale());
    expect(result.items[0].allocations).toEqual([{batchId:1,quantity:6},{batchId:2,quantity:4}]); expect(result.cogsMinor).toBe(540);
    expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches WHERE batch_number='EARLY'").get().quantity_on_hand).toBe(0);
    expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches WHERE batch_number='EXPIRED'").get().quantity_on_hand).toBe(50);
    expect(db.prepare("SELECT count(*) count FROM InventoryMovements WHERE movement_type='sale'").get().count).toBe(2);
  });
  test("snapshots price, line discount, invoice discount, GST and rounded payable",()=>{const sale=baseSale({invoiceDiscountType:"percentage",invoiceDiscountValue:10}); sale.items[0].unitPriceMinor=123; sale.items[0].discountType="fixed"; sale.items[0].discountValue=30;
    const result=new SalesPostingService(db).post(sale); expect(result).toMatchObject({grossMinor:1230,lineDiscountMinor:30,invoiceDiscountMinor:120,taxableMinor:1080,gstMinor:194,exactTotalMinor:1274,finalTotalMinor:1300,roundingMinor:26});
    expect(db.prepare("SELECT original_unit_price_minor,charged_unit_price_minor,gst_minor FROM SaleItems").get()).toEqual({original_unit_price_minor:110,charged_unit_price_minor:123,gst_minor:194});
  });
  test("creates receivable and only records money actually collected",()=>{const result=new SalesPostingService(db).post(baseSale({paymentMethod:"credit",collectionMethod:"cash",amountPaidMinor:500,customerId:Number(customer),dueDate:"2026-10-01"}));
    expect(result.balanceDueMinor).toBe(result.finalTotalMinor-500); expect(db.prepare("SELECT method,amount_minor FROM MoneyMovements").get()).toEqual({method:"cash",amount_minor:500});
    expect(db.prepare("SELECT balance_minor FROM Receivables").get().balance_minor).toBe(result.balanceDueMinor);
  });
  test("blocks duplicate submission, expired stock and insufficient stock",()=>{const service=new SalesPostingService(db); service.post(baseSale());
    expect(()=>service.post(baseSale())).toThrow(); const tooMuch=baseSale({invoiceNumber:"INV-2",idempotencyKey:"other"}); tooMuch.items[0].quantity=100;
    expect(()=>service.post(tooMuch)).toThrow("Insufficient valid"); expect(db.prepare("SELECT count(*) count FROM Sales").get().count).toBe(1);
  });
  test("rolls back sale, stock and money if any line fails",()=>{const sale=baseSale(); sale.items.push({productId:99999,saleUnit:"tablet",quantity:1});
    expect(()=>new SalesPostingService(db).post(sale)).toThrow(); expect(db.prepare("SELECT count(*) count FROM Sales").get().count).toBe(0);
    expect(db.prepare("SELECT sum(quantity_on_hand) total FROM ProductBatches").get().total).toBe(76); expect(db.prepare("SELECT count(*) count FROM MoneyMovements").get().count).toBe(0);
  });
  test("requires customer identity and valid due date for unpaid balance",()=>{expect(()=>new SalesPostingService(db).post(baseSale({paymentMethod:"credit",amountPaidMinor:0,dueDate:"2026-10-01"}))).toThrow("Customer");
    expect(()=>new SalesPostingService(db).post(baseSale({paymentMethod:"credit",amountPaidMinor:0,customerId:Number(customer),dueDate:"2026-09-10"}))).toThrow("Due date");});
  test("requires an actual method when collecting partial payment on credit",()=>{
    expect(()=>new SalesPostingService(db).post(baseSale({paymentMethod:"credit",amountPaidMinor:500,customerId:Number(customer),dueDate:"2026-10-01"}))).toThrow("Actual collection method");
  });
});
