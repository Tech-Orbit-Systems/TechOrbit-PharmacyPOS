const fs=require("fs"); const os=require("os"); const path=require("path");
const {openDatabase}=require("../infrastructure/sqlite/database");
const {ProductsRepository}=require("../infrastructure/sqlite/repositories/products");
const {ProductUnitsRepository}=require("../infrastructure/sqlite/repositories/product-units");
const {SalesPostingService}=require("../infrastructure/sqlite/services/sales-posting");
const {dailySalesSummary,dailySalesCsv}=require('../modernization/desktop/daily-sales.cjs');
const {medicineSummary}=require('../modernization/desktop/sales-breakdown.cjs');

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
    const daily=dailySalesSummary(db,{range:'custom',from:'2026-09-11',to:'2026-09-11',product:'Paracetamol'},
      {costVisible:true,now:new Date('2026-09-12T00:00:00Z')});
    expect(daily.totals).toMatchObject({salesMinor:1300,returnsMinor:0,gstMinor:194,discountMinor:150,
      netExGstMinor:1106,cogsMinor:540,grossProfitMinor:566,saleCount:1});
  });
  test("keeps a sale after midnight on the open official day while calendar view uses its local date",()=>{
    db.prepare("INSERT INTO BusinessDays(opened_at,closed_at,status) VALUES (?,?,?)")
      .run("2026-09-11T08:00:00Z","2026-09-12T02:00:00Z","closed");
    new SalesPostingService(db).post(baseSale({soldAt:"2026-09-11T21:00:00Z",paymentMethod:"credit",amountPaidMinor:0,
      customerId:Number(customer),dueDate:"2026-10-01"}));
    const options={costVisible:true,now:new Date("2026-09-13T00:00:00Z")};
    const official=dailySalesSummary(db,{range:"custom",from:"2026-09-11",to:"2026-09-11",dayMode:"official"},options);
    const calendar=dailySalesSummary(db,{range:"custom",from:"2026-09-12",to:"2026-09-12",dayMode:"calendar"},options);
    expect(official.days).toHaveLength(1); expect(official.days[0].day).toBe("2026-09-11");
    expect(calendar.days).toHaveLength(1); expect(calendar.days[0].day).toBe("2026-09-12");
    expect(official.totals).toMatchObject({saleCount:1,salesMinor:calendar.totals.salesMinor});
    expect(dailySalesSummary(db,{range:"custom",from:"2026-09-12",to:"2026-09-12",dayMode:"official"},options).totals.saleCount).toBe(0);
  });
  test("weekly sales uses Pakistan Monday boundaries and reconciles its period totals with invoices",()=>{
    const service=new SalesPostingService(db);
    service.post(baseSale());
    service.post(baseSale({invoiceNumber:"INV-101",idempotencyKey:"sale-key-101",soldAt:"2026-09-14T12:00:00Z"}));
    const input={range:"custom",from:"2026-09-11",to:"2026-09-14",period:"week",dayMode:"calendar"};
    const summary=dailySalesSummary(db,input,{costVisible:true,now:new Date("2026-09-15T00:00:00Z")});
    expect(summary.days.map(row=>row.day)).toEqual(["2026-09-14","2026-09-07"]);
    expect(summary.days.reduce((sum,row)=>sum+row.netSalesMinor,0)).toBe(summary.totals.netSalesMinor);
    expect(summary.totals).toMatchObject({saleCount:2,salesMinor:2600,cogsMinor:1140});
    const exported=dailySalesCsv(db,input,{costVisible:false,now:new Date("2026-09-15T00:00:00Z")});
    expect(exported.filename).toContain("Weekly_Sales");
    expect(exported.csv).toContain('"Week starting Monday"');
    expect(exported.csv).not.toContain("COGS minor");
    expect(()=>dailySalesSummary(db,{...input,period:"quarter"})).toThrow("valid sales period");
  });
  test("monthly sales separates September and October at Pakistan midnight and keeps partial ranges",()=>{
    const service=new SalesPostingService(db);
    service.post(baseSale({soldAt:"2026-09-30T18:00:00Z"}));
    service.post(baseSale({invoiceNumber:"INV-101",idempotencyKey:"sale-key-101",soldAt:"2026-09-30T20:00:00Z"}));
    const input={range:"custom",from:"2026-09-30",to:"2026-10-01",period:"month",dayMode:"calendar"};
    const options={costVisible:true,now:new Date("2026-10-02T00:00:00Z")};
    const monthly=dailySalesSummary(db,input,options);
    expect(monthly.days.map(row=>row.day)).toEqual(["2026-10-01","2026-09-01"]);
    expect(monthly.days.map(row=>row.salesMinor)).toEqual([1300,1300]);
    expect(monthly.totals).toMatchObject({saleCount:2,salesMinor:2600,cogsMinor:1140});
    expect(dailySalesSummary(db,{...input,period:"day"},options).totals.netSalesMinor).toBe(monthly.totals.netSalesMinor);
    expect(dailySalesCsv(db,input,{costVisible:false,...options}).csv).toContain('"Month starting"');
  });
  test("medicine groups allocate invoice rounding across two saved product lines without losing revenue",()=>{
    const second=new ProductsRepository(db).create({name:"Ibuprofen 200mg",genericName:"Ibuprofen",baseUnit:"tablet",taxStatus:"exempt"});
    new ProductUnitsRepository(db).configure(second.id,[{unitName:"tablet",baseQuantity:1,sellingPriceMinor:100,isDefaultSaleUnit:true}]);
    const stamp=new Date().toISOString();
    db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(second.id,"IBU-1","2028-01-31",40,100,20,"2026-01-01",stamp,stamp);
    const sale=baseSale({invoiceDiscountType:"fixed",invoiceDiscountValue:25});
    sale.items.push({productId:second.id,saleUnit:"tablet",quantity:3});
    new SalesPostingService(db).post(sale);
    const input={range:"custom",from:"2026-09-11",to:"2026-09-11"},options={costVisible:true,now:new Date("2026-09-12T00:00:00Z")};
    const byMedicine=medicineSummary(db,input,options),daily=dailySalesSummary(db,input,options);
    expect(byMedicine.groups.map(row=>row.medicine).sort()).toEqual(["Ibuprofen 200mg","Paracetamol 500mg"]);
    for(const field of ['salesMinor','netSalesMinor','gstMinor','netExGstMinor','cogsMinor','grossProfitMinor'])
      expect(byMedicine.totals[field]).toBe(daily.totals[field]);
    expect(medicineSummary(db,{...input,product:"Ibuprofen"},options).groups).toHaveLength(1);
    db.prepare("UPDATE Products SET category='Pain relief' WHERE id IN (?,?)").run(product.id,second.id);
    const category=medicineSummary(db,{...input,groupBy:'category'},options);
    expect(category.groups).toHaveLength(1);
    expect(category.groups[0].groupLabel).toBe('Pain relief');
    expect(category.totals.netSalesMinor).toBe(daily.totals.netSalesMinor);
    expect(medicineSummary(db,{...input,groupBy:'category',category:'Unknown'},options).groups).toHaveLength(0);
    db.prepare("UPDATE Products SET manufacturer='North Labs' WHERE id IN (?,?)").run(product.id,second.id);
    const brand=medicineSummary(db,{...input,groupBy:'brand'},options);
    expect(brand.groups).toHaveLength(1);
    expect(brand.groups[0].groupLabel).toBe('North Labs');
    expect(brand.totals.netSalesMinor).toBe(daily.totals.netSalesMinor);
    expect(medicineSummary(db,{...input,groupBy:'brand',brand:'South Labs'},options).groups).toHaveLength(0);
    const tax=medicineSummary(db,{...input,groupBy:'tax'},options);
    expect(tax.groups.map(row=>row.groupLabel).sort()).toEqual(['Exempt','Taxable']);
    expect(tax.groups.find(row=>row.groupLabel==='Exempt').gstMinor).toBe(0);
    expect(tax.groups.find(row=>row.groupLabel==='Taxable').gstMinor).toBe(daily.totals.gstMinor);
    expect(tax.groups.find(row=>row.groupLabel==='Taxable').taxableBaseMinor).toBeGreaterThan(0);
    expect(tax.totals.netSalesMinor).toBe(daily.totals.netSalesMinor);
  });
  test("generic report combines different medicines with the same saved generic snapshot",async()=>{
    const second=new ProductsRepository(db).create({name:"Paracetamol syrup",genericName:"Paracetamol",baseUnit:"bottle",taxStatus:"exempt"});
    new ProductUnitsRepository(db).configure(second.id,[{unitName:"bottle",baseQuantity:1,sellingPriceMinor:300,isDefaultSaleUnit:true}]);
    const stamp=new Date().toISOString();
    db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(second.id,"SYRUP-1","2028-01-31",120,300,10,"2026-01-01",stamp,stamp);
    const sale=baseSale();sale.items.push({productId:second.id,saleUnit:"bottle",quantity:1});
    new SalesPostingService(db).post(sale);
    const input={range:"custom",from:"2026-09-11",to:"2026-09-11",groupBy:"generic"};
    const grouped=medicineSummary(db,input,{costVisible:true,now:new Date("2026-09-12T00:00:00Z")});
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0].groupLabel).toBe("Paracetamol");
    expect(grouped.groups[0].netSalesMinor).toBe(grouped.totals.netSalesMinor);
    expect(grouped.totals.netSalesMinor).toBe(dailySalesSummary(db,input,{costVisible:true,now:new Date("2026-09-12T00:00:00Z")}).totals.netSalesMinor);
    expect(medicineSummary(db,{...input,generic:"Ibu"}).groups).toHaveLength(0);
    const reports=require('../modernization/desktop/sales-breakdown.cjs');
    expect(reports.medicineCsv(db,input,{costVisible:false}).csv).toContain('"Sales by Generic"');
    const workbook=new (require('exceljs').Workbook)();
    await workbook.xlsx.load(Buffer.from((await reports.medicineXlsx(db,input,{costVisible:true})).base64,'base64'));
    expect(workbook.getWorksheet('Sales by Generic').getCell('A7').value).toBe('Paracetamol');
    expect(Buffer.from(reports.medicinePdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    const brandBook=new (require('exceljs').Workbook)();
    await brandBook.xlsx.load(Buffer.from((await reports.medicineXlsx(db,{...input,groupBy:'brand'},{costVisible:true})).base64,'base64'));
    expect(brandBook.getWorksheet('Sales by Brand-Manufacturer').getCell('A7').value).toBe('Unspecified brand');
  });
  test("cashier report attributes sale lines and linked net totals to original sale users",()=>{
    const stamp=new Date().toISOString();
    const insert=db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES (?,? ,?,(SELECT id FROM Roles WHERE code='cashier'),?,?)");
    const first=Number(insert.run('counter-a','fixture','Counter A',stamp,stamp).lastInsertRowid);
    const second=Number(insert.run('counter-b','fixture','Counter B',stamp,stamp).lastInsertRowid);
    const service=new SalesPostingService(db);
    service.post(baseSale({createdBy:first}));
    service.post(baseSale({invoiceNumber:'INV-101',idempotencyKey:'sale-key-101',createdBy:second}));
    const input={range:'custom',from:'2026-09-11',to:'2026-09-11',groupBy:'cashier'};
    const report=medicineSummary(db,input,{costVisible:true,now:new Date('2026-09-12T00:00:00Z')});
    expect(report.groups.map(row=>row.groupLabel).sort()).toEqual(['Counter A','Counter B']);
    expect(report.groups.map(row=>row.netSalesMinor)).toEqual([1300,1300]);
    expect(report.totals.netSalesMinor).toBe(dailySalesSummary(db,input,{costVisible:true,now:new Date('2026-09-12T00:00:00Z')}).totals.netSalesMinor);
    expect(medicineSummary(db,{...input,cashier:'Counter A'},{costVisible:false}).groups).toHaveLength(1);
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
