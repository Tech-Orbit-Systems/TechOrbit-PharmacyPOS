const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');
const {openDatabase}=require('../../infrastructure/sqlite/database');

test('B03 customer and supplier returns post from original records and reconcile in desktop',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-returns-'));
 const env={...process.env,TECHORBIT_UI_DATA_DIR:dataDir,TECHORBIT_DISABLE_HARDWARE_ACCELERATION:'1'};
 delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Sales History',exact:true}).click();await page.getByLabel('Invoice number filter').fill('DEMO-3');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('row').filter({has:page.getByText('DEMO-3',{exact:true})}).getByRole('button',{name:'View'}).click();
  await page.getByRole('dialog',{name:'Invoice DEMO-3'}).getByRole('button',{name:'Start return'}).click();
  const customer=page.getByRole('dialog',{name:'Customer return · DEMO-3'});
  await customer.getByLabel('Return base quantity line 1').fill('1');await customer.getByLabel('Customer return reason').fill('Opened medicine package');
  await customer.getByRole('button',{name:'Review customer return'}).click();await expect(customer.getByRole('region',{name:'Customer return preview'})).toContainText('Customer due reduced first');
  await customer.getByRole('button',{name:'Post customer return'}).click();await expect(page.getByText(/Customer return #\d+ posted/)).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Invoice DEMO-3'}).getByRole('region',{name:'Previous returns'})).toContainText('due credit');
  await page.getByRole('button',{name:'Close dialog'}).click();

  await page.getByLabel('Invoice number filter').fill('DEMO-0');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('row').filter({has:page.getByText('DEMO-0',{exact:true})}).getByRole('button',{name:'View'}).click();
  await page.getByRole('dialog',{name:'Invoice DEMO-0'}).getByRole('button',{name:'Start return'}).click();
  const paidCustomer=page.getByRole('dialog',{name:'Customer return · DEMO-0'});
  await paidCustomer.getByLabel('Return base quantity line 1').fill('1');await paidCustomer.getByLabel('Restock line 1').check();await paidCustomer.getByLabel('Confirm condition line 1').check();
  await paidCustomer.getByLabel('Customer return reason').fill('Sealed and suitable for resale');await paidCustomer.getByRole('button',{name:'Review customer return'}).click();
  await expect(paidCustomer.getByRole('region',{name:'Customer return preview'})).toContainText('Original batch restock');
  await paidCustomer.getByLabel('Customer refund method').selectOption('card');await paidCustomer.getByRole('button',{name:'Post customer return'}).click();
  await expect(page.getByText(/Customer return #\d+ posted.*Refund/)).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();

  await page.getByRole('button',{name:'Purchases',exact:true}).click();
  await page.getByLabel('Purchase invoice number',{exact:true}).fill('B03-SUP-001');
  const product=page.getByLabel('Purchase product 1',{exact:true});const productId=await product.locator('option').filter({hasText:'Panadol 500 mg'}).first().getAttribute('value');await product.selectOption(productId);
  await page.getByLabel('Purchased quantity 1',{exact:true}).fill('1');await page.getByLabel('Unit cost 1',{exact:true}).fill('10');await page.getByLabel('Selling price 1',{exact:true}).fill('20');
  await page.getByLabel('Batch number 1',{exact:true}).fill('B03-SUP-B1');await page.getByLabel('Expiry 1',{exact:true}).fill('12/2028');
  await page.getByLabel('Purchase payment method',{exact:true}).selectOption('credit');await page.getByLabel('Purchase due date',{exact:true}).fill(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  await page.getByRole('button',{name:'Review purchase',exact:true}).click();await page.getByRole('dialog',{name:'Review purchase'}).getByRole('button',{name:'Post purchase'}).click();await expect(page.getByText(/Purchase #\d+ posted/)).toBeVisible();
  await page.getByRole('button',{name:'Purchase history',exact:true}).click();
  const purchaseRow=page.getByRole('row').filter({hasText:'B03-SUP-001'});await purchaseRow.getByRole('button',{name:'View'}).click();
  await page.getByRole('dialog',{name:'Purchase B03-SUP-001'}).getByRole('button',{name:'Start supplier return'}).click();
  const supplier=page.getByRole('dialog',{name:'Supplier return · B03-SUP-001'});
  const quantity=supplier.getByLabel(/Supplier return quantity line/);await quantity.fill('1');await supplier.getByLabel('Supplier return reason').fill('Supplier accepted excess stock');
  await supplier.getByRole('button',{name:'Review supplier return'}).click();await expect(supplier.getByRole('region',{name:'Supplier return preview'})).toContainText('Supplier payable reduced first');
  await supplier.getByRole('button',{name:'Post supplier return'}).click();await expect(page.getByText(/Supplier return #\d+ posted/)).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Purchase B03-SUP-001'}).getByRole('region',{name:'Previous supplier returns'})).toContainText('payable credit');
  await page.getByRole('button',{name:'Close dialog'}).click();

  await page.getByRole('button',{name:'Receiving',exact:true}).click();await page.getByLabel('Purchase invoice number',{exact:true}).fill('B03-SUP-PAID');
  await page.getByLabel('Purchase product 1',{exact:true}).selectOption(productId);await page.getByLabel('Purchased quantity 1',{exact:true}).fill('1');
  await page.getByLabel('Unit cost 1',{exact:true}).fill('10');await page.getByLabel('Selling price 1',{exact:true}).fill('20');
  await page.getByLabel('Batch number 1',{exact:true}).fill('B03-SUP-PAID-B1');await page.getByLabel('Expiry 1',{exact:true}).fill('12/2028');
  await page.getByLabel('Purchase payment method',{exact:true}).selectOption('cash');
  await page.getByRole('button',{name:'Review purchase',exact:true}).click();await page.getByRole('dialog',{name:'Review purchase'}).getByRole('button',{name:'Post purchase'}).click();
  await expect(page.getByText(/Purchase #\d+ posted/)).toBeVisible();await page.getByRole('button',{name:'Purchase history',exact:true}).click();
  await page.getByRole('row').filter({hasText:'B03-SUP-PAID'}).getByRole('button',{name:'View'}).click();
  await page.getByRole('dialog',{name:'Purchase B03-SUP-PAID'}).getByRole('button',{name:'Start supplier return'}).click();
  const refundedSupplier=page.getByRole('dialog',{name:'Supplier return · B03-SUP-PAID'});
  await refundedSupplier.getByLabel(/Supplier return quantity line/).fill('1');await refundedSupplier.getByLabel('Supplier return reason').fill('Supplier cash refund');
  await refundedSupplier.getByRole('button',{name:'Review supplier return'}).click();await expect(refundedSupplier.getByRole('region',{name:'Supplier return preview'})).toContainText('Actual refund received');
  await refundedSupplier.getByLabel('Supplier refund method').selectOption('cash');await refundedSupplier.getByRole('button',{name:'Post supplier return'}).click();
  await expect(page.getByText(/Supplier return #\d+ posted.*Refund received/)).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../evidence/returns-batch-p052-p053.png')});
  expect(errors).toEqual([]);
 }finally{await app.close()}
 const db=openDatabase({filename:path.join(dataDir,'review.sqlite3')});
 try{
  expect(db.prepare('SELECT COUNT(*) count FROM SaleReturns').get().count).toBe(2);
  expect(db.prepare('SELECT COUNT(*) count FROM PurchaseReturns').get().count).toBe(2);
  expect(db.prepare("SELECT COUNT(*) count FROM InventoryMovements WHERE reference_type='sale_return_disposal'").get().count).toBe(1);
  expect(db.prepare("SELECT direction,method FROM MoneyMovements WHERE reference_type='sale_return'").get()).toEqual({direction:'out',method:'card'});
  expect(db.prepare("SELECT direction,method FROM MoneyMovements WHERE reference_type='purchase_return'").get()).toEqual({direction:'in',method:'cash'});
  expect(db.prepare("SELECT COUNT(*) count FROM SaleReceiptSnapshots WHERE sale_id IN (SELECT sale_id FROM SaleReturns)").get().count).toBe(2);
 }finally{db.close()}
});
