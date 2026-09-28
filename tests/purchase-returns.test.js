const {openDatabase}=require('../infrastructure/sqlite/database');
const {SuppliersRepository}=require('../infrastructure/sqlite/repositories/suppliers');
const {ProductsRepository}=require('../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../infrastructure/sqlite/repositories/product-units');
const {PurchaseReceivingService}=require('../infrastructure/sqlite/services/purchase-receiving');
const {PurchaseReturnsService}=require('../infrastructure/sqlite/services/purchase-returns');
const {PurchasePaymentsService}=require('../infrastructure/sqlite/services/purchase-payments');
const {supplierReturnSummary,supplierReturnEntries,supplierReturnCsv,supplierReturnXlsx,supplierReturnPdf}=require('../modernization/desktop/supplier-return-report.cjs');
const {purchaseSummary,purchaseEntries,purchaseCsv,purchaseXlsx,purchasePdf}=require('../modernization/desktop/purchase-report.cjs');
const {supplierPurchaseSummary,supplierPurchaseEntries,supplierPurchaseCsv,supplierPurchaseXlsx,supplierPurchasePdf}=require('../modernization/desktop/purchase-report.cjs');
const {bonusStockSummary,bonusStockEntries,bonusStockCsv,bonusStockXlsx,bonusStockPdf}=require('../modernization/desktop/bonus-stock-report.cjs');
const {stockMovementSummary,stockMovementEntries,stockMovementCsv,stockMovementXlsx,stockMovementPdf}=require('../modernization/desktop/stock-movement-report.cjs');
const {adjustmentSummary,adjustmentEntries,adjustmentCsv,adjustmentXlsx,adjustmentPdf}=require('../modernization/desktop/adjustment-report.cjs');
const {StockAdjustmentsService}=require('../infrastructure/sqlite/services/stock-adjustments');
const key=n=>`TO-${String(n).padStart(8,'0')}-2222-2222-2222-222222222222`;

describe('supplier purchase returns',()=>{
 let db,purchase,item,batch;
 beforeEach(()=>{
  db=openDatabase({filename:':memory:'});
  const supplier=new SuppliersRepository(db).create({name:'Supplier'});
  const product=new ProductsRepository(db).create({name:'Item',productType:'general',baseUnit:'piece'});
  new ProductUnitsRepository(db).configure(product.id,[{unitName:'piece',baseQuantity:1,sellingPriceMinor:200,isDefaultSaleUnit:true}]);
  purchase=new PurchaseReceivingService(db).receive({supplierId:supplier.id,idempotencyKey:'buy',paymentMethod:'credit',dueDate:'2027-01-01',items:[{productId:product.id,purchasedQuantity:10,unitCostMinor:100,salePriceMinor:200}]});
  item=db.prepare('SELECT * FROM PurchaseItems').get();
  batch=db.prepare('SELECT * FROM ProductBatches').get();
 });
 afterEach(()=>db.close());

 test('reduces original batch and payable atomically with replay protection',()=>{
  const service=new PurchaseReturnsService(db);
  const input={purchaseId:purchase.purchaseId,idempotencyKey:key(1),reason:'Damaged at delivery',items:[{purchaseItemId:item.id,quantity:4}]};
  expect(service.preview(input)).toMatchObject({totalMinor:400,payableCreditMinor:400,refundMinor:0});
  expect(service.post(input)).toMatchObject({totalMinor:400,payableCreditMinor:400,idempotent:false});
  expect(service.post(input).idempotent).toBe(true);
  expect(()=>service.post({...input,reason:'Changed'})).toThrow(/different details/);
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch.id).quantity_on_hand).toBe(6);
  expect(db.prepare('SELECT balance_minor FROM Payables').get().balance_minor).toBe(600);
  expect(db.prepare("SELECT quantity_delta FROM InventoryMovements WHERE movement_type='purchase_return'").get().quantity_delta).toBe(-4);
 });
 test('R021 saved movement ledger reconciles purchase in and supplier return out',async()=>{
  new PurchaseReturnsService(db).post({purchaseId:purchase.purchaseId,idempotencyKey:key(50),reason:'Damaged',items:[{purchaseItemId:item.id,quantity:4}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'}),input={range:'custom',from:day,to:day};
  const report=stockMovementSummary(db,input);
  expect(report.totals).toMatchObject({count:2,inQuantity:10,outQuantity:4,netQuantity:6});
  expect(report.totals.netQuantity).toBe(db.prepare('SELECT SUM(quantity_delta) total FROM InventoryMovements').get().total);
  expect(stockMovementSummary(db,{...input,type:'purchase_return'}).totals.netQuantity).toBe(-4);
  expect(stockMovementSummary(db,{...input,product:'Unknown'}).totals.count).toBe(0);
  expect(stockMovementEntries(db,{...input,page:1,pageSize:1}).hasMore).toBe(true);
  expect(stockMovementCsv(db,input).csv).toContain('"Net movement","6"');
  expect(Buffer.from((await stockMovementXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(stockMovementPdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
 });
 test('R022 reconciles manual disposal and gain to original adjustment items and detects drift',async()=>{
  const service=new StockAdjustmentsService(db);
  service.post({adjustmentType:'disposal',idempotencyKey:'report-disposal',reason:'Damaged',roleCode:'admin',items:[{batchId:batch.id,quantityDelta:-2}]});
  service.post({adjustmentType:'gain',idempotencyKey:'report-gain',reason:'Count correction',roleCode:'admin',items:[{batchId:batch.id,quantityDelta:1}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'}),input={range:'custom',from:day,to:day};
  const report=adjustmentSummary(db,input);
  expect(report.totals).toMatchObject({count:2,inQuantity:1,outQuantity:2,netQuantity:-1});
  expect(report.items.find(row=>row.kind==='disposal')).toMatchObject({previousQuantity:10,newQuantity:8,quantityDelta:-2});
  expect(adjustmentSummary(db,{...input,kind:'disposal'}).totals.outQuantity).toBe(2);
  expect(adjustmentEntries(db,{...input,page:1,pageSize:1}).hasMore).toBe(true);
  expect(adjustmentCsv(db,input).csv).toContain('"Net adjustment","-1"');
  expect(Buffer.from((await adjustmentXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(adjustmentPdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
  db.prepare('UPDATE StockAdjustmentItems SET new_quantity=new_quantity+1').run();
  expect(()=>adjustmentSummary(db,input)).toThrow(/does not reconcile/);
 });

 test('blocks excess return and leaves every ledger untouched',()=>{
  const service=new PurchaseReturnsService(db);
  expect(()=>service.post({purchaseId:purchase.purchaseId,idempotencyKey:key(2),reason:'Too many',items:[{purchaseItemId:item.id,quantity:11}]})).toThrow(/exceeds/);
  expect(db.prepare('SELECT COUNT(*) count FROM PurchaseReturns').get().count).toBe(0);
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches').get().quantity_on_hand).toBe(10);
 });

 test('fully paid purchase records only actual refund received',()=>{
  db.prepare("UPDATE Payables SET balance_minor=0,status='paid'").run();
  db.prepare('UPDATE Purchases SET balance_due_minor=0').run();
  const service=new PurchaseReturnsService(db);
  const input={purchaseId:purchase.purchaseId,idempotencyKey:key(3),reason:'Supplier agreed refund',refundMethod:'bank_transfer',items:[{purchaseItemId:item.id,quantity:2}]};
  expect(service.post(input)).toMatchObject({totalMinor:200,payableCreditMinor:0,refundMinor:200});
  expect(db.prepare("SELECT direction,amount_minor FROM MoneyMovements WHERE reference_type='purchase_return'").get()).toEqual({direction:'in',amount_minor:200});
 });
 test('supplier return report reconciles payable credit, actual refund and batch stock',async()=>{
  const service=new PurchaseReturnsService(db);
  service.post({purchaseId:purchase.purchaseId,idempotencyKey:key(11),reason:'Damaged',items:[{purchaseItemId:item.id,quantity:4}]});
  new PurchasePaymentsService(db).post({payableId:db.prepare('SELECT id FROM Payables').get().id,amountMinor:600,
    method:'bank_transfer',idempotencyKey:'paid-before-second-return',paidAt:new Date().toISOString()});
  service.post({purchaseId:purchase.purchaseId,idempotencyKey:key(12),reason:'Supplier refund',refundMethod:'bank_transfer',
    items:[{purchaseItemId:item.id,quantity:2}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
  const input={range:'custom',from:day,to:day},report=supplierReturnSummary(db,input);
  expect(report.totals).toMatchObject({returnMinor:600,payableCreditMinor:400,refundMinor:200,quantity:6,returnCount:2});
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch.id).quantity_on_hand).toBe(4);
  expect(db.prepare('SELECT balance_minor FROM Payables').get().balance_minor).toBe(0);
  expect(db.prepare("SELECT amount_minor FROM MoneyMovements WHERE reference_type='purchase_return'").get().amount_minor).toBe(200);
  expect(supplierReturnSummary(db,{...input,supplier:'Supplier'}).totals.returnMinor).toBe(600);
  expect(supplierReturnSummary(db,{...input,product:'Unknown'}).totals.returnMinor).toBe(0);
  expect(supplierReturnEntries(db,{...input,page:1,pageSize:1}).hasMore).toBe(true);
  expect(supplierReturnCsv(db,input).csv).toContain('"Total supplier returns minor","600"');
  expect(Buffer.from((await supplierReturnXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(supplierReturnPdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
 });
 test('purchase report reconciles purchase, later payment, return, current due and bonus units',async()=>{
  const returns=new PurchaseReturnsService(db);
  returns.post({purchaseId:purchase.purchaseId,idempotencyKey:key(21),reason:'Damaged',items:[{purchaseItemId:item.id,quantity:4}]});
  new PurchasePaymentsService(db).post({payableId:db.prepare('SELECT id FROM Payables').get().id,amountMinor:600,
    method:'bank_transfer',idempotencyKey:'paid-before-report',paidAt:new Date().toISOString()});
  returns.post({purchaseId:purchase.purchaseId,idempotencyKey:key(22),reason:'Supplier refund',refundMethod:'bank_transfer',items:[{purchaseItemId:item.id,quantity:2}]});
  new PurchaseReceivingService(db).receive({supplierId:db.prepare('SELECT id FROM Suppliers').get().id,invoiceNumber:'BONUS-BUY',
    idempotencyKey:'bonus-buy',paymentMethod:'cash',amountPaidMinor:200,
    items:[{productId:item.product_id,purchasedQuantity:2,bonusQuantity:1,unitCostMinor:100,salePriceMinor:200,batchNumber:'BONUS-BATCH',expiryDate:'2028-12-31'}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'}),input={range:'custom',from:day,to:day};
  const report=purchaseSummary(db,input);
  expect(report.totals).toMatchObject({purchaseCount:2,totalMinor:1200,paidAtReceivingMinor:200,laterPaymentsMinor:600,
    balanceDueMinor:0,supplierReturnsMinor:600,returnCreditMinor:400,returnRefundMinor:200,netPurchaseMinor:600,
    purchasedBaseQuantity:12,bonusBaseQuantity:1,receivedBaseQuantity:13});
  expect(report.items.reduce((sum,row)=>sum+row.totalMinor,0)).toBe(report.totals.totalMinor);
  expect(purchaseSummary(db,{...input,product:'Item'}).totals.purchaseCount).toBe(2);
  expect(purchaseSummary(db,{...input,product:'Unknown'}).totals.purchaseCount).toBe(0);
  expect(purchaseEntries(db,{...input,page:1,pageSize:1}).hasMore).toBe(true);
  expect(purchaseCsv(db,input).csv).toContain('"Total net purchases minor","600"');
  expect(Buffer.from((await purchaseXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(purchasePdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
 });
 test('supplier purchase report groups distinct suppliers and reconciles invoice totals and exports',async()=>{
  const other=new SuppliersRepository(db).create({name:'Second Supplier'});
  new PurchaseReceivingService(db).receive({supplierId:other.id,invoiceNumber:'SECOND-BUY',idempotencyKey:'supplier-group-buy',paymentMethod:'cash',amountPaidMinor:300,
   items:[{productId:item.product_id,purchasedQuantity:3,unitCostMinor:100,salePriceMinor:200}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'}),input={range:'custom',from:day,to:day};
  const report=supplierPurchaseSummary(db,input);
  expect(report.suppliers).toHaveLength(2);
  expect(report.totals).toMatchObject({purchaseCount:2,totalMinor:1300,balanceDueMinor:1000});
  expect(report.suppliers.reduce((sum,row)=>sum+row.totalMinor,0)).toBe(report.totals.totalMinor);
  expect(supplierPurchaseSummary(db,{...input,supplier:'Second'}).totals).toMatchObject({purchaseCount:1,totalMinor:300,balanceDueMinor:0});
  expect(supplierPurchaseSummary(db,{...input,product:'Unknown'}).suppliers).toHaveLength(0);
  expect(supplierPurchaseEntries(db,{...input,page:1,pageSize:1}).hasMore).toBe(true);
  expect(supplierPurchaseCsv(db,input).csv).toContain('"Total purchases minor","1300"');
  expect(Buffer.from((await supplierPurchaseXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(supplierPurchasePdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
 });
 test('bonus stock report reconciles paid/free receipt units and paid cost without inventing savings',async()=>{
  new PurchaseReceivingService(db).receive({supplierId:db.prepare('SELECT id FROM Suppliers').get().id,invoiceNumber:'BONUS-3',
   idempotencyKey:'bonus-report-buy',paymentMethod:'cash',amountPaidMinor:200,
   items:[{productId:item.product_id,purchasedQuantity:2,bonusQuantity:1,unitCostMinor:100,salePriceMinor:200,batchNumber:'BONUS-3',expiryDate:'2028-12-31'}]});
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'}),input={range:'custom',from:day,to:day};
  const report=bonusStockSummary(db,input);
  expect(report.totals).toMatchObject({lineCount:1,purchasedBaseQuantity:2,bonusBaseQuantity:1,receivedBaseQuantity:3,paidCostMinor:200});
  expect(report.products[0]).toMatchObject({purchasedBaseQuantity:2,bonusBaseQuantity:1,paidCostMinor:200});
  expect(bonusStockSummary(db,{...input,product:'Unknown'}).items).toHaveLength(0);
  expect(bonusStockEntries(db,{...input,page:1}).items).toHaveLength(1);
  expect(bonusStockCsv(db,input).csv).toContain('"Total bonus base units","1"');
  expect(Buffer.from((await bonusStockXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(bonusStockPdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
  db.prepare('UPDATE BatchReceipts SET bonus_base_quantity=2 WHERE purchase_id=(SELECT id FROM Purchases WHERE invoice_number=?)').run('BONUS-3');
  expect(()=>bonusStockSummary(db,input)).toThrow(/does not reconcile/);
 });

 test('ambiguous batch source blocks supplier return before stock changes',()=>{
  const now=new Date().toISOString();
  db.prepare('INSERT INTO BatchReceipts(batch_id,purchase_id,received_at,created_at) VALUES(?,NULL,?,?)').run(batch.id,now,now);
  const service=new PurchaseReturnsService(db);
  expect(()=>service.preview({purchaseId:purchase.purchaseId,reason:'Source uncertain',items:[{purchaseItemId:item.id,quantity:1}]})).toThrow(/combines sources/);
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch.id).quantity_on_hand).toBe(10);
 });
});
