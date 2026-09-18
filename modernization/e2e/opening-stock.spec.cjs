const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P033 manual opening-stock preview and commit passes once with isolated data',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-opening-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await page.getByRole('button',{name:'Opening stock',exact:true}).click();await page.getByLabel('Find opening stock product',{exact:true}).fill('Cetirizine');await page.getByLabel('Opening stock product',{exact:true}).selectOption({label:'Cetirizine 10 mg'});
  await page.getByLabel('Opening stock batch number',{exact:true}).fill('OPEN-E2E');await page.getByLabel('Opening stock expiry',{exact:true}).fill('12/2028');await page.getByLabel('Opening stock quantity',{exact:true}).fill('3');await page.getByLabel('Opening stock unit cost',{exact:true}).fill('10');await page.getByRole('button',{name:'Preview manual entry',exact:true}).click();
  await expect(page.getByText('2028-12-31',{exact:true})).toBeVisible();await expect(page.getByText('READY',{exact:true})).toBeVisible();await page.screenshot({path:path.resolve(__dirname,'../evidence/opening-stock-preview.png')});await page.getByRole('button',{name:'Commit opening stock',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Search inventory',{exact:true}).fill('OPEN-E2E');await expect(page.getByText(/OPEN-E2E/)).toBeVisible();await expect(page.getByText('3 strip',{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);
 }finally{await app.close()}
});
