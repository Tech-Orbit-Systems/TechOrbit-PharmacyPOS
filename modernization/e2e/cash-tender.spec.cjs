const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P040 full cash sale displays tender and change before posting',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-cash-tender-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
    const search=page.getByLabel('Scan barcode or search medicine',{exact:true});await search.fill('0012345678903');await search.press('Enter');await page.getByLabel('Acknowledge sale warnings',{exact:true}).check();
    const pay=page.getByRole('button',{name:/Pay & Print/});await expect(pay).toBeDisabled();const tender=page.getByLabel('Cash tendered PKR',{exact:true});await tender.fill('100');await expect(page.getByText('50',{exact:true}).last()).toBeVisible();await expect(pay).toBeEnabled();
    await page.screenshot({path:path.resolve(__dirname,'../evidence/cash-tender-change.png')});await pay.click();const dialog=page.getByRole('dialog',{name:'Sale completed'});await expect(dialog).toContainText('Cash tendered PKR 100');await expect(dialog).toContainText('Change PKR 50');expect(errors).toEqual([]);
  }finally{await app.close();}
});
