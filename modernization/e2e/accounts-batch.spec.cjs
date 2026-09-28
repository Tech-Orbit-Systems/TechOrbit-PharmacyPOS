const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');
const future=()=>new Date(Date.now()+30*86400000).toISOString().slice(0,10);

test('B02 customers, dues and expense settlements reconcile through one desktop flow',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-accounts-')),TECHORBIT_DISABLE_HARDWARE_ACCELERATION:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();

  await page.getByRole('button',{name:'Accounts',exact:true}).click();await expect(page.getByRole('heading',{name:'Accounts',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Ahmed Khan',exact:true})).toBeVisible();
  await page.getByRole('row').filter({hasText:'Ahmed Khan'}).getByRole('button',{name:'History',exact:true}).click();await expect(page.getByRole('dialog',{name:'Ahmed Khan'})).toBeVisible();await expect(page.getByText('Invoice history',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Dues',exact:true}).click();const customerRow=page.getByRole('row').filter({hasText:'Ahmed Khan'});await expect(customerRow).toBeVisible();await customerRow.getByRole('button',{name:'Settle',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Settlement amount').fill('10');await dialog.getByLabel('Settlement method').selectOption('digital');await dialog.getByLabel('Settlement reference').fill('B02-CUSTOMER');await dialog.getByRole('button',{name:'Record payment'}).click();await expect(page.getByText(/Ahmed Khan payment recorded/)).toBeVisible();

  await page.getByRole('button',{name:'Purchases',exact:true}).click();await page.getByLabel('Purchase invoice number',{exact:true}).fill('B02-SUP-001');const product=page.getByLabel('Purchase product 1',{exact:true});const productValue=await product.locator('option').filter({hasText:'Panadol 500 mg'}).first().getAttribute('value');await product.selectOption(productValue);await page.getByLabel('Purchased quantity 1',{exact:true}).fill('1');await page.getByLabel('Unit cost 1',{exact:true}).fill('10');await page.getByLabel('Selling price 1',{exact:true}).fill('20');await page.getByLabel('Batch number 1',{exact:true}).fill('B02-SUP-B1');await page.getByLabel('Expiry 1',{exact:true}).fill('12/2028');await page.getByLabel('Purchase payment method',{exact:true}).selectOption('credit');await page.getByLabel('Purchase due date',{exact:true}).fill(future());await page.getByRole('button',{name:'Review purchase'}).click();await page.getByRole('dialog').getByRole('button',{name:'Post purchase'}).click();await expect(page.getByText(/Purchase #\d+ posted/)).toBeVisible();
  await page.getByRole('button',{name:'Accounts',exact:true}).click();await page.getByRole('button',{name:'Dues',exact:true}).click();await page.getByLabel('Dues account type').selectOption('supplier');const supplierRow=page.getByRole('row').filter({hasText:'B02-SUP-001'});await expect(supplierRow).toBeVisible();await supplierRow.getByRole('button',{name:'Settle',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Settlement method').selectOption('bank_transfer');await dialog.getByLabel('Settlement date').fill(new Date(Date.now()+86400000).toISOString().slice(0,10));await dialog.getByLabel('Settlement reference').fill('B02-SUPPLIER');await dialog.getByRole('button',{name:'Record payment'}).click();await expect(page.getByText(/Demo Medical Distributors payment recorded/)).toBeVisible();

  await page.getByRole('button',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'Add vendor',exact:true}).click();dialog=page.getByRole('dialog',{name:'Add vendor'});await dialog.getByLabel('Vendor name').fill('Utility Vendor');await dialog.getByLabel('Vendor phone').fill('0420000000');await dialog.getByRole('button',{name:'Save vendor'}).click();await page.getByLabel('Expense vendor').selectOption({label:'Utility Vendor'});await page.getByLabel('Expense amount').fill('90');await page.getByLabel('Expense paid amount').fill('20');await page.getByLabel('Expense due date').fill(future());await page.getByLabel('Expense reference').fill('B02-EXP-001');await page.getByLabel('Expense description').fill('Internet and utilities');await page.getByRole('button',{name:'Post expense'}).click();await expect(page.getByText(/Expense #\d+ posted\. Paid 20 · Due 70/)).toBeVisible();
  await page.getByRole('button',{name:'Dues',exact:true}).click();const vendorRow=page.getByRole('row').filter({hasText:'Utility Vendor'});await expect(vendorRow).toBeVisible();await vendorRow.getByRole('button',{name:'Settle',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Settlement method').selectOption('card');await dialog.getByLabel('Settlement reference').fill('B02-VENDOR');await dialog.getByRole('button',{name:'Record payment'}).click();await expect(page.getByText(/Utility Vendor payment recorded/)).toBeVisible();
  await page.getByLabel('Dues account type').selectOption('vendor');await page.getByLabel('Dues status').selectOption('paid');await expect(page.getByRole('row').filter({hasText:'Utility Vendor'})).toBeVisible();await page.screenshot({path:path.resolve(__dirname,'../evidence/accounts-batch-p046-p051.png')});await page.getByRole('button',{name:'Reports',exact:true}).click();
  await page.getByRole('tab',{name:'Customer Receivable Report',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Customer Receivable Report',exact:true})).toBeVisible();
  await page.getByLabel('Customer name',{exact:true}).fill('Ahmed');await page.getByRole('button',{name:'Run report',exact:true}).click();
  await expect(page.getByRole('cell',{name:'Ahmed Khan',exact:true})).toBeVisible();
  const exportPath=path.join(env.TECHORBIT_UI_DATA_DIR,'r024-customer-receivable.csv');
  await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},exportPath);
  await page.getByRole('button',{name:'Export CSV',exact:true}).click();
  await expect(page.getByText('CSV customer receivable report saved.')).toBeVisible();
  expect(fs.readFileSync(exportPath,'utf8')).toContain('"Total later payments minor","1000"');
  await page.getByRole('tab',{name:'Supplier Payable Report',exact:true}).click();
  await page.getByLabel('Supplier name',{exact:true}).fill('Demo Medical');await page.getByLabel('Account reference',{exact:true}).fill('B02-SUP-001');await page.getByLabel('Balance status',{exact:true}).selectOption('paid');await page.getByRole('button',{name:'Run report',exact:true}).click();
  await expect(page.getByRole('cell',{name:'B02-SUP-001',exact:true})).toBeVisible();
  const supplierExport=path.join(env.TECHORBIT_UI_DATA_DIR,'r025-supplier-payable.csv');await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},supplierExport);
  await page.getByRole('button',{name:'Export CSV',exact:true}).click();await expect(page.getByText('CSV supplier payable report saved.')).toBeVisible();
  expect(fs.readFileSync(supplierExport,'utf8')).toContain('"Total balance minor","0"');
  await page.getByRole('tab',{name:'Vendor Payable Report',exact:true}).click();
  await page.getByLabel('Vendor name',{exact:true}).fill('Utility Vendor');await page.getByLabel('Balance status',{exact:true}).selectOption('paid');await page.getByRole('button',{name:'Run report',exact:true}).click();
  await expect(page.getByRole('cell',{name:'B02-EXP-001',exact:true})).toBeVisible();
  const vendorExport=path.join(env.TECHORBIT_UI_DATA_DIR,'r026-vendor-payable.csv');await app.evaluate(({dialog},chosen)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:chosen})},vendorExport);
  await page.getByRole('button',{name:'Export CSV',exact:true}).click();await expect(page.getByText('CSV vendor payable report saved.')).toBeVisible();
  expect(fs.readFileSync(vendorExport,'utf8')).toContain('"Total later payments minor","7000"');
  expect(errors).toEqual([]);
 }finally{await app.close()}
});
