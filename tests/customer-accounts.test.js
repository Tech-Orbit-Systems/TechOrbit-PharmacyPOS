const {openDatabase}=require('../infrastructure/sqlite/database');
const {ProductsRepository}=require('../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../infrastructure/sqlite/repositories/product-units');
const {SalesPostingService}=require('../infrastructure/sqlite/services/sales-posting');
const {CustomerAccountsService}=require('../infrastructure/sqlite/services/customer-accounts');
const {CustomerReturnsService}=require('../infrastructure/sqlite/services/customer-returns');
const key=n=>`TO-${String(n).padStart(8,'0')}-1111-1111-1111-111111111111`;

describe('customer accounts and sale returns',()=>{
 let db,sale,item,receivable,batch;
 beforeEach(()=>{
  db=openDatabase({filename:':memory:'});
  const product=new ProductsRepository(db).create({name:'Item',productType:'general',baseUnit:'piece'});
  new ProductUnitsRepository(db).configure(product.id,[{unitName:'piece',baseQuantity:1,sellingPriceMinor:100,isDefaultSaleUnit:true}]);
  const now='2026-09-12T09:00:00Z';
  batch=db.prepare('INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(product.id,null,null,40,100,10,now,now,now).lastInsertRowid;
  const customer=db.prepare("INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES ('Ali','03001234567','03001234567',?,?)").run(now,now).lastInsertRowid;
  sale=new SalesPostingService(db).post({invoiceNumber:'INV-C1',idempotencyKey:'sale-c1',soldAt:now,customerId:Number(customer),paymentMethod:'credit',amountPaidMinor:0,dueDate:'2026-10-01',items:[{productId:product.id,saleUnit:'piece',quantity:5}]});
  item=db.prepare('SELECT * FROM SaleItems WHERE sale_id=?').get(sale.saleId);
  receivable=db.prepare('SELECT * FROM Receivables').get();
 });
 afterEach(()=>db.close());

 test('R024 balances reconcile collections and return credit, due boundaries and native exports',async()=>{
  const reports=require('../modernization/desktop/account-balance-reports.cjs'),options={now:new Date('2026-10-02T00:00:00Z')};
  new CustomerAccountsService(db).collect({receivableId:receivable.id,amountMinor:100,method:'cash',idempotencyKey:'r024-collect'});
  new CustomerReturnsService(db).post({saleId:sale.saleId,idempotencyKey:key(24),reason:'Unopened return',items:[{saleItemId:item.id,baseQuantity:2,restockable:true,conditionConfirmed:true}]});
  const report=reports.accountBalanceSummary(db,{party:'ali'},options);
  expect(report.totals).toMatchObject({originalMinor:500,paymentsMinor:100,creditMinor:200,balanceMinor:200,overdueMinor:200});
  expect(report.items[0]).toMatchObject({reference:'INV-C1',daysOverdue:1});
  expect(reports.accountBalanceSummary(db,{status:'overdue'},{now:new Date('2026-10-01T00:00:00Z')}).items).toHaveLength(0);
  expect(reports.accountBalanceSummary(db,{reference:'missing'},options).totals.balanceMinor).toBe(0);
  expect(reports.accountBalanceEntries(db,{page:1,pageSize:1},options).items).toHaveLength(1);
  expect(()=>reports.accountBalanceSummary(db,{dueFrom:'2026-10-10',dueTo:'2026-10-01'})).toThrow(/reversed/);
  expect(()=>reports.accountBalanceSummary(db,{dueFrom:'2026-02-30'})).toThrow(/Invalid date/);
  expect(reports.accountBalanceCsv(db,{},options).csv).toContain('"Total balance minor","200"');
  expect(Buffer.from((await reports.accountBalanceXlsx(db,{},options)).base64,'base64').subarray(0,2).toString()).toBe('PK');
  expect(Buffer.from(reports.accountBalancePdf(db,{},options).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
  db.prepare('UPDATE Receivables SET balance_minor=199').run();
  expect(()=>reports.accountBalanceSummary(db,{},options)).toThrow(/do not reconcile/);
 });

 test('collects receivable idempotently and reconciles sale',()=>{
  const service=new CustomerAccountsService(db);
  const input={receivableId:receivable.id,amountMinor:200,method:'cash',idempotencyKey:'collect-1'};
  expect(service.collect(input)).toMatchObject({balanceMinor:300,status:'partial',idempotent:false});
  expect(service.collect(input).idempotent).toBe(true);
  expect(()=>service.collect({...input,amountMinor:1})).toThrow(/different details/);
  expect(()=>service.collect({receivableId:receivable.id,amountMinor:1,collectedAt:'2026-09-01T09:00:00Z',idempotencyKey:'backdated'})).toThrow(/earlier than the sale/);
  expect(db.prepare('SELECT amount_paid_minor,balance_due_minor FROM Sales').get()).toEqual({amount_paid_minor:200,balance_due_minor:300});
 });

 test('restocks original batch, credits due first and rejects excess/replay changes',()=>{
  const service=new CustomerReturnsService(db);
  const input={saleId:sale.saleId,idempotencyKey:key(1),reason:'Unopened return',items:[{saleItemId:item.id,baseQuantity:2,restockable:true,conditionConfirmed:true}]};
  expect(service.preview(input)).toMatchObject({totalMinor:200,receivableCreditMinor:200,refundMinor:0});
  expect(service.post(input)).toMatchObject({totalMinor:200,receivableCreditMinor:200,refundMinor:0,idempotent:false});
  expect(service.post(input).idempotent).toBe(true);
  expect(()=>service.post({...input,reason:'Changed'})).toThrow(/different details/);
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch).quantity_on_hand).toBe(7);
  expect(db.prepare('SELECT balance_minor FROM Receivables').get().balance_minor).toBe(300);
  expect(()=>service.post({...input,idempotencyKey:key(2),items:[{...input.items[0],baseQuantity:4}]})).toThrow(/exceeds sold/);
  expect(db.prepare('SELECT COUNT(*) count FROM SaleReturns').get().count).toBe(1);
 });

 test('non-sellable return disposes stock and only actual refund moves money',()=>{
  const service=new CustomerReturnsService(db);
  const collected=new CustomerAccountsService(db).collect({receivableId:receivable.id,amountMinor:500,method:'cash',idempotencyKey:'col-full'});
  expect(collected.balanceMinor).toBe(0);
  const input={saleId:sale.saleId,idempotencyKey:key(3),reason:'Opened package',refundMethod:'cash',items:[{saleItemId:item.id,baseQuantity:2,restockable:false,conditionConfirmed:false}]};
  expect(service.post(input)).toMatchObject({totalMinor:200,receivableCreditMinor:0,refundMinor:200});
  expect(db.prepare('SELECT quantity_on_hand,disposed_quantity FROM ProductBatches WHERE id=?').get(batch)).toMatchObject({quantity_on_hand:5,disposed_quantity:2});
  expect(db.prepare("SELECT COUNT(*) count FROM MoneyMovements WHERE reference_type='sale_return'").get().count).toBe(1);
  expect(db.prepare("SELECT SUM(quantity_delta) qty FROM InventoryMovements WHERE reference_type IN ('sale_return','sale_return_disposal')").get().qty).toBe(0);
  expect(db.prepare('SELECT restockable FROM SaleReturnItems').get().restockable).toBe(0);
 });

 test('expired original batch cannot be marked sellable on return',()=>{
  db.prepare('UPDATE ProductBatches SET expiry_date=? WHERE id=?').run('2026-09-20',batch);
  const service=new CustomerReturnsService(db);
  const input={saleId:sale.saleId,idempotencyKey:key(4),reason:'Expired return',items:[{saleItemId:item.id,baseQuantity:1,restockable:true,conditionConfirmed:true}]};
  expect(()=>service.preview(input)).toThrow(/Expired original batch/);
  expect(service.post({...input,items:[{...input.items[0],restockable:false,conditionConfirmed:false}]})).toMatchObject({receivableCreditMinor:100,refundMinor:0});
  expect(db.prepare('SELECT quantity_on_hand FROM ProductBatches WHERE id=?').get(batch).quantity_on_hand).toBe(5);
 });
});
