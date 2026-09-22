const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P039 warning review blocks payment until acknowledged and saves prescription context',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-warning-ack-'))};
  delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByLabel('Username',{exact:true}).fill('demo');
    await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
    const search=page.getByLabel('Scan barcode or search medicine',{exact:true});await search.fill('0012345678902');await search.press('Enter');
    const warnings=page.getByRole('region',{name:'Sale warnings'});await expect(warnings).toBeVisible();
    await expect(warnings).toContainText('Near-expiry stock');await expect(warnings).toContainText('Prescription-required medicine');
    const pay=page.getByRole('button',{name:/Pay & Print/});await expect(pay).toBeDisabled();
    await page.getByLabel('Doctor name',{exact:true}).fill('Dr Sana');
    await page.getByLabel('Prescription reference',{exact:true}).fill('RX-P039-001');
    await page.getByLabel('Acknowledge sale warnings',{exact:true}).check();await expect(pay).toBeEnabled();
    await page.screenshot({path:path.resolve(__dirname,'../evidence/warning-acknowledgement.png')});
    await pay.click();const dialog=page.getByRole('dialog',{name:'Sale completed'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Warnings acknowledged by Demo Pharmacist');await expect(dialog).toContainText('RX-P039-001');
    expect(errors).toEqual([]);
  }finally{await app.close();}
});
