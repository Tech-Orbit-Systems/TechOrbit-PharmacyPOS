const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P036 receives a partial-paid bonus purchase and shows saved history',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-purchase-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Purchases',exact:true}).click();
  await page.getByLabel('Purchase invoice number',{exact:true}).fill('P036-E2E-001');
  const productSelect=page.getByLabel('Purchase product 1',{exact:true});
  const panadolValue=await productSelect.locator('option').filter({hasText:'Panadol 500 mg'}).first().getAttribute('value');
  await productSelect.selectOption(panadolValue);
  await page.getByLabel('Purchased quantity 1',{exact:true}).fill('2');await page.getByLabel('Bonus quantity 1',{exact:true}).fill('1');
  await page.getByLabel('Unit cost 1',{exact:true}).fill('50');await page.getByLabel('Selling price 1',{exact:true}).fill('130');
  await page.getByLabel('Batch number 1',{exact:true}).fill('P036-E2E-B1');await page.getByLabel('Expiry 1',{exact:true}).fill('09/2028');
  await page.getByLabel('Purchase payment method',{exact:true}).selectOption('bank_transfer');await page.getByLabel('Purchase amount paid',{exact:true}).fill('40');
  const future=new Date(Date.now()+30*86400000).toISOString().slice(0,10);await page.getByLabel('Purchase due date',{exact:true}).fill(future);
  await page.getByRole('button',{name:'Review purchase',exact:true}).click();await expect(page.getByRole('dialog',{name:'Review purchase'})).toBeVisible();
  const review=page.getByRole('dialog');await expect(review.getByText('100',{exact:true})).toBeVisible();await expect(review.getByText('60',{exact:true})).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../evidence/purchase-receiving-preview.png')});
  await page.getByRole('button',{name:'Post purchase',exact:true}).click();await expect(page.getByText(/Purchase #\d+ posted\. Paid 40 · Due 60\./)).toBeVisible();
  await page.getByRole('button',{name:'Purchase history',exact:true}).click();await expect(page.getByText('P036-E2E-001',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View',exact:true}).last().click();await expect(page.getByText('2 + 1 bonus strip',{exact:false})).toBeVisible();expect(errors).toEqual([]);
 }finally{await app.close()}
});
