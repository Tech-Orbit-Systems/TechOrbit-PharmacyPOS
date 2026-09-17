const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P031 alternatives require explicit selection in three isolated repetitions',async()=>{
 test.setTimeout(180000);
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-alternatives-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
  for(let run=1;run<=3;run++){
   const search=page.getByLabel('Scan barcode or search medicine',{exact:true});await search.fill('0012345678901');await search.press('Enter');
   const invoice=page.getByTestId('invoice');await expect(invoice.getByText('Panadol 500 mg',{exact:true})).toBeVisible();await expect(invoice.getByText('Paracetamol Health 500 mg',{exact:true})).toHaveCount(0);
   await invoice.getByRole('button',{name:'View alternatives',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('Paracetamol Health 500 mg',{exact:true})).toBeVisible();await expect(dialog.getByText('Prescription-required warning',{exact:true})).toBeVisible();await expect(invoice.getByText('Panadol 500 mg',{exact:true})).toBeVisible();
   await dialog.getByRole('button',{name:'Add alternative',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(invoice.getByText('Panadol 500 mg',{exact:true})).toBeVisible();await expect(invoice.getByText('Paracetamol Health 500 mg',{exact:true})).toBeVisible();
   if(run===3)await page.screenshot({path:path.resolve(__dirname,'../evidence/generic-alternatives.png')});
   await invoice.getByRole('button',{name:'Remove Panadol 500 mg',exact:true}).click();await invoice.getByRole('button',{name:'Remove Paracetamol Health 500 mg',exact:true}).click();
  }
  expect(errors).toEqual([]);
 }finally{await app.close()}
});
