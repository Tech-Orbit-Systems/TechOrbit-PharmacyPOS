const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

async function login(page){
  await page.getByLabel('Username',{exact:true}).fill('demo');
  await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Point of Sale',exact:true}).click();
}

test('P043 restores an active cart and reconciles an uncertain payment after restart',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-sale-recovery-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await login(page);
    const search=page.getByLabel('Scan barcode or search medicine',{exact:true});
    await search.fill('0012345678901');await search.press('Enter');
    await expect(page.getByText('Panadol 500 mg',{exact:true}).last()).toBeVisible();
    await page.getByLabel('Cash tendered PKR',{exact:true}).fill('500');
    const storageKey=await page.evaluate(()=>Object.keys(localStorage).find(key=>key.startsWith('techorbit.active-sale.v1.')));
    await expect.poll(()=>page.evaluate(key=>Boolean(localStorage.getItem(key)),storageKey)).toBe(true);

    await page.reload();await login(page);
    await expect(page.locator('.recovery-notice')).toContainText('active sale was restored');
    await expect(page.getByText('Panadol 500 mg',{exact:true}).last()).toBeVisible();

    const posted=await page.evaluate(async key=>{
      const draft=JSON.parse(localStorage.getItem(key));
      const input={key:draft.key,paymentMethod:draft.method,creditMode:draft.creditMode,paidMinor:0,dueDate:draft.dueDate,customerId:draft.customer,cashTenderedMinor:50000,invoiceDiscountType:draft.discountType,invoiceDiscountValue:0,warningAcknowledged:true,doctorName:draft.doctorName,prescriptionReference:draft.prescriptionReference,items:draft.lines.map(line=>({productId:line.product.id,saleUnit:line.unit,quantity:line.quantity,unitPriceMinor:Math.round(Number(line.unitPrice)*100),discountType:line.discountType,discountValue:0,overrideBatchId:line.overrideBatchId,overrideReason:line.overrideReason}))};
      const receipt=await window.pharmacy.post(input);
      localStorage.setItem(key,JSON.stringify({...draft,state:'uncertain',warningAcknowledged:true,savedAt:new Date().toISOString()}));
      return {input,saleId:receipt.saleId};
    },storageKey);

    await page.reload();await login(page);
    const dialog=page.getByRole('dialog',{name:'Sale completed'});
    await expect(dialog).toBeVisible();
    await expect(page.locator('.recovery-notice')).toContainText('already saved');
    const retry=await page.evaluate(input=>window.pharmacy.post(input),posted.input);
    expect(retry.saleId).toBe(posted.saleId);
    await page.screenshot({path:path.resolve(__dirname,'../evidence/active-sale-recovery.png')});
    expect(errors).toEqual([]);
  }finally{await app.close();}
});
