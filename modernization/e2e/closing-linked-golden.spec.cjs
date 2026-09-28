const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');
const bcrypt=require('bcrypt');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {SuppliersRepository}=require('../../infrastructure/sqlite/repositories/suppliers');
const {ProductsRepository}=require('../../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../../infrastructure/sqlite/repositories/product-units');
const {CashClosingService}=require('../../infrastructure/sqlite/services/cash-closing');
const {ClosingConfigurationService}=require('../../infrastructure/sqlite/services/closing-configuration');
const {PurchaseReceivingService}=require('../../infrastructure/sqlite/services/purchase-receiving');
const {PurchasePaymentsService}=require('../../infrastructure/sqlite/services/purchase-payments');
const {PurchaseReturnsService}=require('../../infrastructure/sqlite/services/purchase-returns');
const {SalesPostingService}=require('../../infrastructure/sqlite/services/sales-posting');
const {CustomerReturnsService}=require('../../infrastructure/sqlite/services/customer-returns');
const {CustomerAccountsService}=require('../../infrastructure/sqlite/services/customer-accounts');
const {ExpensesService}=require('../../infrastructure/sqlite/services/expenses');

const at=hour=>`2026-09-12T${String(hour).padStart(2,'0')}:00:00Z`;
function seedBooks(filename){
 const db=openDatabase({filename});
 try{
  const admin=Number(db.prepare('INSERT INTO Users(username,password_hash,display_name,role_id,must_change_password,created_at,updated_at) VALUES(?,?,?,4,0,?,?)')
    .run('b04-review',bcrypt.hashSync('B04-Review-2026!',10),'B04 Reviewer',at(0),at(0)).lastInsertRowid);
  db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,must_change_password,created_at,updated_at) SELECT 'daily-cashier',?,'Daily Cashier',id,0,?,? FROM Roles WHERE code='cashier'")
    .run(bcrypt.hashSync('Daily-Cashier-2026!',10),at(0),at(0));
  const config=new ClosingConfigurationService(db);
  const bank=config.saveAccount({kind:'bank',name:'Statement bank'},admin),wallet=config.saveAccount({kind:'wallet',name:'Statement wallet'},admin),reserve=config.saveAccount({kind:'savings',name:'Reserve'},admin);
  const supplier=new SuppliersRepository(db).create({name:'Linked supplier'});
  const product=new ProductsRepository(db).create({name:'Linked medicine',productType:'general',baseUnit:'piece'});
  new ProductUnitsRepository(db).configure(product.id,[{unitName:'piece',baseQuantity:1,sellingPriceMinor:2000,isDefaultSaleUnit:true}]);
  const customer=Number(db.prepare("INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES('Ali','03001234567','03001234567',?,?)").run(at(0),at(0)).lastInsertRowid);
  const vendor=Number(db.prepare("INSERT INTO Vendors(name,active,created_at,updated_at) VALUES('Linked utility',1,?,?)").run(at(0),at(0)).lastInsertRowid);
  new CashClosingService(db).open({userId:admin,deviceId:'modern-desktop',openingCashMinor:10000,openedAt:at(8)});
  const purchase=new PurchaseReceivingService(db).receive({supplierId:supplier.id,invoiceNumber:'GOLD-BUY',idempotencyKey:'gold-buy',purchasedAt:at(9),createdBy:admin,deviceId:'modern-desktop',paymentMethod:'card',amountPaidMinor:2000,dueDate:'2026-10-01',items:[{productId:product.id,purchasedQuantity:10,unitCostMinor:1000,salePriceMinor:2000,batchNumber:'GOLD-BATCH',expiryDate:'2028-12-31'}]});
  const sales=new SalesPostingService(db);
  const sell=(name,hour,method,quantity,extra={})=>sales.post({invoiceNumber:name,idempotencyKey:name,soldAt:at(hour),createdBy:admin,deviceId:'modern-desktop',paymentMethod:method,items:[{productId:product.id,saleUnit:'piece',quantity}],...extra});
  const cash=sell('GOLD-CASH',10,'cash',2);
  sell('GOLD-CARD',11,'card',1);sell('GOLD-DIGITAL',12,'digital',1);
  const credit=sell('GOLD-CREDIT',13,'credit',2,{customerId:customer,amountPaidMinor:0,dueDate:'2026-10-01'});
  const receivable=db.prepare("SELECT id FROM Receivables WHERE source_type='sale' AND source_id=?").get(String(credit.saleId));
  new CustomerAccountsService(db).collect({receivableId:receivable.id,amountMinor:1500,method:'cash',collectedAt:at(14),createdBy:admin,deviceId:'modern-desktop',idempotencyKey:'gold-collect'});
  const saleItem=db.prepare('SELECT id FROM SaleItems WHERE sale_id=?').get(cash.saleId);
  new CustomerReturnsService(db).post({saleId:cash.saleId,reason:'Unopened',returnedAt:at(15),refundMethod:'cash',createdBy:admin,deviceId:'modern-desktop',idempotencyKey:'TO-11111111-1111-1111-1111-111111111111',items:[{saleItemId:saleItem.id,baseQuantity:1,restockable:true,conditionConfirmed:true}]});
  const payable=db.prepare("SELECT id FROM Payables WHERE source_type='purchase' AND source_id=?").get(String(purchase.purchaseId));
  new PurchasePaymentsService(db).post({payableId:payable.id,amountMinor:3000,method:'bank_transfer',paidAt:at(16),createdBy:admin,deviceId:'modern-desktop',idempotencyKey:'gold-supplier-pay'});
  const purchaseItem=db.prepare('SELECT id FROM PurchaseItems WHERE purchase_id=?').get(purchase.purchaseId);
  new PurchaseReturnsService(db).post({purchaseId:purchase.purchaseId,reason:'Excess',returnedAt:at(17),createdBy:admin,deviceId:'modern-desktop',idempotencyKey:'TO-22222222-2222-2222-2222-222222222222',items:[{purchaseItemId:purchaseItem.id,quantity:1}]});
  const expenses=new ExpensesService(db);
  const expense=expenses.post({categoryId:1,vendorId:vendor,incurredAmountMinor:2500,amountPaidMinor:1000,method:'cash',expenseDate:at(18),dueDate:'2026-10-01',description:'Utility bill',idempotencyKey:'gold-expense',createdBy:admin,deviceId:'modern-desktop'});
  const vendorPayable=db.prepare('SELECT id FROM ExpensePayables WHERE expense_id=?').get(expense.expenseId);
  expenses.settle({payableId:vendorPayable.id,amountMinor:500,method:'mobile_wallet',paidAt:at(19),idempotencyKey:'gold-vendor-pay',createdBy:admin,deviceId:'modern-desktop'});
  config.recordSavingsTransfer({accountId:reserve.id,amountMinor:700,transferredAt:at(20),reference:'Signed reserve transfer'},admin);
  return {bank:bank.id,wallet:wallet.id};
 }finally{db.close()}
}

test('B04 linked books reconcile through desktop closing and survive restart',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-b04-linked-'));
 const filename=path.join(dataDir,'review.sqlite3'),accounts=seedBooks(filename);
 const env={...process.env,TECHORBIT_UI_DATA_DIR:dataDir,TECHORBIT_UI_DATABASE:filename,TECHORBIT_DISABLE_HARDWARE_ACCELERATION:'1'};
 delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 let app=await launch();
 try{
  let page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const signIn=async()=>{await page.getByLabel('Username',{exact:true}).fill('b04-review');await page.getByLabel('Password',{exact:true}).fill('B04-Review-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Closing',exact:true}).click()};
  await signIn();
  await page.getByLabel('Counted cash (Rs)').fill('125.00');
  await page.getByRole('button',{name:'Close shift'}).click();
  await expect(page.getByText(/0 open shifts · \d+ unresolved money movements/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Official daily close'})).toBeDisabled();
  const assignments=await page.getByLabel(/Account for movement/).evaluateAll(elements=>elements.map(element=>({id:Number(element.getAttribute('aria-label').match(/\d+/)[0]),method:element.closest('tr').querySelectorAll('td')[1].textContent.trim()})));
  for(const {id,method} of assignments){
    const selector=page.getByLabel(`Account for movement ${id}`),row=page.getByRole('row').filter({has:selector});
    await selector.selectOption({label:['card','bank_transfer'].includes(method)?'Statement bank':'Statement wallet'});
    await row.getByRole('button',{name:'Assign'}).click();
    await expect(selector).toHaveCount(0);
  }
  await expect(page.getByText('0 unresolved money movements')).toBeVisible();
  await page.getByLabel('Actual statement net for Statement bank').fill('-30.00');
  await page.getByLabel('Actual statement net for Statement wallet').fill('15.00');
  await page.getByRole('button',{name:'Official daily close'}).click();
  await expect(page.getByText('No open business day.')).toBeVisible();
  await page.getByRole('button',{name:'View',exact:true}).first().click();
  await expect(page.getByText(/Original snapshot and 0 revisions are retained/)).toBeVisible();
  await page.getByLabel('Revised counted cash (Rs)').fill('124.50');
  await page.getByLabel('Revision reason').fill('Signed cash recount');
  await page.getByRole('button',{name:'Save revision'}).click();
  await expect(page.getByText(/Original snapshot and 1 revisions are retained/)).toBeVisible();
  await page.getByRole('tab',{name:'Six-Month Closing'}).click();
  await expect(page.getByText(/2026-09/).first()).toBeVisible();
  expect(errors).toEqual([]);
  await app.close();app=await launch();page=await app.firstWindow();await signIn();
  await page.getByRole('button',{name:'View',exact:true}).first().click();
  await expect(page.getByText(/Original snapshot and 1 revisions are retained/)).toBeVisible();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business KPIs'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Stock KPIs'})).toBeVisible();
  await expect(page.getByText('Vendor dues')).toBeVisible();
  await expect(page.getByText('Expired stock value')).toBeVisible();
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await page.getByRole('button',{name:'Custom',exact:true}).click();
  await page.getByLabel('Report from date').fill('2026-09-12');
  await page.getByLabel('Report to date').fill('2026-09-12');
  await expect(page.getByRole('row').filter({hasText:'Operating profit'})).toContainText('PKR 25');
  await expect(page.getByRole('row').filter({hasText:'Net revenue excluding GST'})).toContainText('PKR 100');
  await expect(page.getByRole('row').filter({hasText:'Incurred expenses'})).toContainText('PKR -25');
  await expect(page.getByText('GOLD-CASH')).toBeVisible();
  const exportPath=path.join(dataDir,'b05-profit-loss.csv');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},exportPath);
  await page.getByRole('button',{name:'Export CSV'}).click();
  await expect(page.getByText('CSV report saved.')).toBeVisible();
  expect(fs.readFileSync(exportPath,'utf8')).toContain('"Operating profit minor","2500"');
  for(const format of ['XLSX','PDF']){
    const filePath=path.join(dataDir,`b05-profit-loss.${format.toLowerCase()}`);
    await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},filePath);
    await page.getByRole('button',{name:`Export ${format}`}).click();
    await expect(page.getByText(`${format} report saved.`)).toBeVisible();
    expect(fs.readFileSync(filePath).subarray(0,4).toString()).toBe(format==='PDF'?'%PDF':'PK\x03\x04');
  }
  await page.getByRole('tab',{name:'Daily Sales'}).click();
  await page.getByRole('combobox',{name:'Range'}).selectOption('custom');
  await page.getByLabel('Daily sales from date').fill('2026-09-12');
  await page.getByLabel('Daily sales to date').fill('2026-09-12');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 100');
  await expect(page.getByText('Sales: 4 · Returns: 1')).toBeVisible();
  await page.getByLabel('Recorded batch supplier').fill('Linked supplier');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 100');
  await page.getByLabel('Customer name or phone').fill('Ali');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 40');
  await page.getByLabel('Customer name or phone').fill('');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 100');
  for(const format of ['CSV','XLSX','PDF']){
    const filePath=path.join(dataDir,`r001-daily-sales.${format.toLowerCase()}`);
    await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},filePath);
    await page.getByRole('button',{name:`Export ${format}`}).click();
    await expect(page.getByText(`${format} daily sales saved.`)).toBeVisible();
    const saved=fs.readFileSync(filePath);
    if(format==='CSV')expect(saved.toString()).toContain('"Net sales minor","10000"');
    else expect(saved.subarray(0,4).toString()).toBe(format==='PDF'?'%PDF':'PK\x03\x04');
  }
  await page.getByRole('tab',{name:'Weekly Sales'}).click();
  await page.getByRole('combobox',{name:'Range'}).selectOption('custom');
  await page.getByLabel('Daily sales from date').fill('2026-09-12');
  await page.getByLabel('Daily sales to date').fill('2026-09-12');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('heading',{name:'Weekly Sales'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Week starting Monday'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 100');
  const weeklyExport=path.join(dataDir,'r002-weekly-sales.csv');
  await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},weeklyExport);
  await page.getByRole('button',{name:'Export CSV'}).click();
  await expect(page.getByText('CSV weekly sales saved.')).toBeVisible();
  expect(fs.readFileSync(weeklyExport,'utf8')).toContain('"Week starting Monday"');
  await page.getByRole('tab',{name:'Monthly Sales'}).click();
  await page.getByRole('combobox',{name:'Range'}).selectOption('custom');
  await page.getByLabel('Daily sales from date').fill('2026-09-12');
  await page.getByLabel('Daily sales to date').fill('2026-09-12');
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.getByRole('heading',{name:'Monthly Sales'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Month starting'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Net sales incl GST'})).toContainText('PKR 100');
  const monthlyExport=path.join(dataDir,'r003-monthly-sales.csv');
  await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},monthlyExport);
  await page.getByRole('button',{name:'Export CSV'}).click();
  await expect(page.getByText('CSV monthly sales saved.')).toBeVisible();
  expect(fs.readFileSync(monthlyExport,'utf8')).toContain('"Month starting"');
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByLabel('Username',{exact:true}).fill('daily-cashier');
  await page.getByLabel('Password',{exact:true}).fill('Daily-Cashier-2026!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Daily Sales'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Profit and Loss'})).toHaveCount(0);
  await expect(page.getByText('Net batch COGS')).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{await app.close()}
 const db=openDatabase({filename});
 try{
  const day=JSON.parse(db.prepare("SELECT snapshot_json FROM BusinessDays WHERE status='closed'").get().snapshot_json);
  expect(day).toMatchObject({cashExpectedMinor:12500,cashCountedMinor:12500,cashVarianceMinor:0,unresolvedMovementCount:0,savingsTransferredMinor:700});
  expect(day.accounts.find(row=>row.id===accounts.bank)).toMatchObject({expectedNetMinor:-3000,actualNetMinor:-3000});
  expect(day.accounts.find(row=>row.id===accounts.wallet)).toMatchObject({expectedNetMinor:1500,actualNetMinor:1500});
  const revision=JSON.parse(db.prepare('SELECT snapshot_json FROM BusinessDayRevisions').get().snapshot_json);
  expect(revision).toMatchObject({cashExpectedMinor:12500,cashCountedMinor:12450,cashVarianceMinor:-50,revisionReason:'Signed cash recount'});
  const report=new CashClosingService(db).rangeReport('2026-09-01T00:00:00Z','2026-09-13T00:00:00Z');
  expect(report.totals).toMatchObject({salesMinor:12000,customerReturnsMinor:2000,netSalesMinor:10000,cogsMinor:5000,grossProfitMinor:5000,expensesMinor:2500,operatingProfitMinor:2500,purchasesMinor:10000,purchaseReturnsMinor:1000,savingsTransferredMinor:700});
  expect(db.prepare('SELECT balance_minor FROM Receivables').get().balance_minor).toBe(2500);
  expect(db.prepare("SELECT balance_minor FROM Payables WHERE source_type='purchase'").get().balance_minor).toBe(4000);
  expect(db.prepare('SELECT balance_minor FROM ExpensePayables').get().balance_minor).toBe(1000);
  expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches WHERE batch_number='GOLD-BATCH'").get().quantity_on_hand).toBe(4);
 }finally{db.close()}
});
