const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('P034 product CSV mapping, preview and atomic commit passes once',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-product-import-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Products',exact:true}).click();await page.getByRole('button',{name:'Import products',exact:true}).click();
  await page.getByLabel('Product import file',{exact:true}).setInputFiles({name:'p034-e2e.csv',mimeType:'text/csv',buffer:Buffer.from('name,barcode,manufacturer,product_type,base_sale_price\nP034 E2E Product,0000349999,TechOrbit,general,45.5\n')});await page.getByRole('button',{name:'Read file',exact:true}).click();await expect(page.getByText('1 rows found.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByText('INSERT',{exact:true})).toBeVisible();await expect(page.getByText('0000349999',{exact:true})).toBeVisible();await page.screenshot({path:path.resolve(__dirname,'../evidence/product-import-preview.png')});await page.getByRole('button',{name:'Commit product import',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByLabel('Search products',{exact:true}).fill('0000349999');await expect(page.getByText('P034 E2E Product',{exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await app.close()}
});
