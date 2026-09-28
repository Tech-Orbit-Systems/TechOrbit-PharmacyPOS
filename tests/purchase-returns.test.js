const {openDatabase}=require('../infrastructure/sqlite/database');
const {SuppliersRepository}=require('../infrastructure/sqlite/repositories/suppliers');
const {ProductsRepository}=require('../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../infrastructure/sqlite/repositories/product-units');
const {PurchaseReceivingService}=require('../infrastructure/sqlite/services/purchase-receiving');
const {PurchaseReturnsService}=require('../infrastructure/sqlite/services/purchase-returns');
const {PurchasePaymentsService}=require('../infrastructure/sqlite/services/purchase-payments');
const {supplierReturnSummary,supplierReturnEntries,supplierReturnCsv,supplierReturnXlsx,supplierReturnPdf}=require('../modernization/desktop/supplier-return-report.cjs');
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

 test('ambiguous batch source blocks supplier return before stock changes',()=>{
  const now=new Date().toISOString();
  db.prepare('INSERT INTO BatchReceipts(batch_id,purchase_id,received_at,created_at) VALUES(?,NULL,?,?)').run(batch.id,now,now);
  const service=new PurchaseReturnsService(db);
  expect(()=>service.preview({purchaseId:purchase.purchaseId,reason:'Source uncertain',items:[{purchaseItemId:item.id,quantity:1}]})).toThrow(/combines sources/);
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch.id).quantity_on_hand).toBe(10);
 });
});
