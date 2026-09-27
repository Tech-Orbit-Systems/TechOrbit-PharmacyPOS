const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('B01 P044-P045 supports repeated scans, unit merge, keyboard focus, dialog focus and one safe submit',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-counter-batch-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
    const search=page.getByLabel('Scan barcode or search medicine',{exact:true});
    for(let index=0;index<2;index++){await search.fill('0012345678901');await search.press('Enter');await expect(search).toHaveValue('');}
    await expect(page.getByLabel('Quantity line 1',{exact:true})).toHaveValue('2');
    await page.keyboard.press('F4');await expect(page.getByLabel('Quantity line 1',{exact:true})).toBeFocused();
    const firstUnit=page.getByLabel('Unit line 1',{exact:true});
    const defaultUnit=await firstUnit.inputValue();
    const alternate=await firstUnit.locator('option').evaluateAll((options,current)=>options.find(option=>option.value!==current&&!option.textContent.toLowerCase().includes('box'))?.value,defaultUnit);
    expect(alternate).toBeTruthy();await firstUnit.selectOption(alternate);
    await search.fill('0012345678901');await search.press('Enter');await expect(page.getByLabel('Unit line 2',{exact:true})).toBeVisible();
    await page.getByLabel('Unit line 2',{exact:true}).selectOption(alternate);
    await expect(page.getByLabel('Unit line 1',{exact:true})).toHaveValue(alternate);await expect(page.getByLabel('Quantity line 1',{exact:true})).toHaveValue('3');await expect(page.getByLabel('Unit line 2',{exact:true})).toHaveCount(0);

    await page.keyboard.press('F3');const held=page.getByRole('button',{name:'Held sales (1)',exact:true});await expect(held).toBeVisible();await held.click();
    const close=page.getByRole('button',{name:'Close dialog',exact:true});await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(held).toBeFocused();
    await held.click();await page.getByRole('button',{name:/Resume sale 1/}).click();await expect(page.getByLabel('Quantity line 1',{exact:true})).toHaveValue('3');
    const warning=page.getByLabel('Acknowledge sale warnings',{exact:true});await expect(warning).toBeVisible();await warning.check();
    await page.getByLabel('Cash tendered PKR',{exact:true}).fill('100000');
    const active=await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('techorbit.active-sale.v1.'));return JSON.parse(localStorage.getItem(key));});
    const pay=page.getByRole('button',{name:/Pay & Print/});await expect(pay).toBeEnabled();
    await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(value=>value.textContent.includes('Pay & Print'));button.click();button.click();});
    const receipt=page.getByRole('dialog',{name:'Sale completed'});await expect(receipt).toBeVisible();
    const matches=await page.evaluate(key=>window.pharmacy.invoiceSearch({invoiceNumber:key,page:1}),active.key);expect(matches.total).toBe(1);
    await page.screenshot({path:path.resolve(__dirname,'../evidence/counter-batch-p044-p045.png')});expect(errors).toEqual([]);
  }finally{await app.close();}
});
