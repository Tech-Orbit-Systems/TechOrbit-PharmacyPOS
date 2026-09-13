const {test,expect,_electron}=require('@playwright/test');const fs=require('fs'),path=require('path'),os=require('os');
test('P029 product create/edit/deactivate in three isolated repetitions',async()=>{
 const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-products-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({executablePath:require('../../node_modules/electron'),args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Products',exact:true}).click();
 for(let i=1;i<=3;i++){
 await page.getByRole('button',{name:'Add product',exact:true}).click();await page.getByLabel('Product name',{exact:true}).fill('E2E Product '+i);await page.getByLabel('Barcode',{exact:true}).fill('00009990'+i);await page.getByLabel('Generic name',{exact:true}).fill('E2E generic');await page.getByLabel('Manufacturer',{exact:true}).fill('Isolated test');await page.getByLabel('Base selling price PKR',{exact:true}).fill('12.50');await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByLabel('Search products',{exact:true}).fill('00009990'+i);await page.getByRole('button',{name:'Edit E2E Product '+i,exact:true}).click();await expect(page.getByLabel('Barcode',{exact:true})).toHaveValue('00009990'+i);await expect(page.getByLabel('Base selling price PKR',{exact:true})).toHaveValue('12.5');await page.getByLabel('Product name',{exact:true}).fill('E2E Renamed '+i);await page.getByLabel('Active product',{exact:true}).uncheck();await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('No products found.',{exact:true})).toBeVisible();await page.getByLabel('Product status filter',{exact:true}).selectOption('inactive');await expect(page.getByRole('button',{name:'Edit E2E Renamed '+i,exact:true})).toBeVisible();await page.getByLabel('Product status filter',{exact:true}).selectOption('active');
 }
 await page.getByLabel('Search products',{exact:true}).fill('');
 await page.getByLabel('Product status filter',{exact:true}).selectOption('all');
 await expect(page.getByRole('button',{name:'Edit E2E Renamed 3',exact:true})).toBeVisible();
 await page.screenshot({path:path.resolve(__dirname,'../evidence/products-light.png')});
 await page.getByRole('button',{name:'Edit E2E Renamed 3',exact:true}).click();
 await page.screenshot({path:path.resolve(__dirname,'../evidence/product-editor-light.png')});
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Dark',exact:true}).click();
 await page.getByRole('button',{name:'Products',exact:true}).click();
 // A newly opened product list defaults to active products; explicitly include inactive fixtures.
 await page.getByLabel('Product status filter',{exact:true}).selectOption('all');
 await expect(page.getByRole('button',{name:'Edit E2E Renamed 3',exact:true})).toBeVisible();
 await page.screenshot({path:path.resolve(__dirname,'../evidence/products-dark.png')});expect(errors).toEqual([]);
 }finally{await app.close()}
});
