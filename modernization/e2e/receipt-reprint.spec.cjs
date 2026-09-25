const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P042 opens immutable customer and pharmacy 80mm receipt copies',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-receipt-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Sales History',exact:true}).click();await page.getByLabel('Invoice number filter',{exact:true}).fill('DEMO-3');await page.getByRole('button',{name:'Search',exact:true}).click();
  const row=page.getByRole('row').filter({has:page.getByText('DEMO-3',{exact:true})});await row.getByRole('button',{name:'View',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Invoice DEMO-3'});await dialog.getByRole('button',{name:'Reprint saved receipt',exact:true}).click();dialog=page.getByRole('dialog',{name:'Receipt DEMO-3'});
  await expect(dialog.getByRole('article',{name:'Customer copy'})).toContainText('Panadol 500 mg');await expect(dialog.getByRole('article',{name:'Pharmacy copy'})).toContainText('Demo Pharmacist');
  await expect(dialog).toContainText('Total PKR');await expect(dialog).toContainText('Historical reprint');await expect(dialog).not.toContainText('Batch');
  await page.screenshot({path:path.resolve(__dirname,'../evidence/historical-receipt.png'),fullPage:true});expect(errors).toEqual([]);
 }finally{await app.close();}
});
