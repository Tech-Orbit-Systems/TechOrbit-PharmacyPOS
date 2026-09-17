const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P032 batch live-stock workflow passes once with isolated data',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-inventory-'))};
 delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();await expect(page.getByText('Authorized',{exact:true})).toBeVisible();
  await page.getByLabel('Search inventory',{exact:true}).fill('Panadol');await expect(page.getByText('Panadol 500 mg',{exact:true}).first()).toBeVisible();
  await page.getByLabel('Expiry status filter',{exact:true}).selectOption('30');await expect(page.getByText('WITHIN 30 DAYS',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:/View batch/}).first().click();await expect(page.getByRole('heading',{name:'Quantity history',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Latest movements',exact:true})).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../evidence/inventory-live-stock.png')});expect(errors).toEqual([]);
 }finally{await app.close()}
});
