const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P037 edits price and applies line plus invoice percentage discounts once',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-pricing-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
  const search=page.getByLabel('Scan barcode or search medicine',{exact:true});await search.fill('0012345678901');await search.press('Enter');
  await page.getByLabel('Unit price line 1',{exact:true}).fill('123.45');await page.getByLabel('Discount type line 1',{exact:true}).selectOption('percentage');await page.getByLabel('Discount value line 1',{exact:true}).fill('5');
  await page.getByLabel('Invoice discount type',{exact:true}).selectOption('percentage');await page.getByLabel('Invoice discount value',{exact:true}).fill('10');
  await expect(page.getByText('Original 120',{exact:true})).toBeVisible();await expect(page.getByTestId('totals-group').getByText('106',{exact:true})).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../evidence/pricing-discounts.png')});await page.getByRole('button',{name:/Pay & Print/}).click();
  const dialog=page.getByRole('dialog',{name:'Sale completed'});await expect(dialog).toBeVisible();await expect(dialog.getByText(/Rate 123\.45 \(original 120\).*Line discount 6\.17/)).toBeVisible();await expect(dialog.getByText('Line discounts PKR 6.17 · Invoice discount PKR 11.73',{exact:true})).toBeVisible();await expect(dialog.getByText('Total PKR 106',{exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await app.close()}
});
