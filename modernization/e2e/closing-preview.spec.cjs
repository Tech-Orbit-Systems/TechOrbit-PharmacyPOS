const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');
test('B04 closing preview shows assigned shift and Pakistan six-month figures',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-closing-'));
 const env={...process.env,TECHORBIT_UI_DATA_DIR:dataDir,TECHORBIT_DISABLE_HARDWARE_ACCELERATION:'1'};
 delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const app=await _electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('Username',{exact:true}).fill('demo');
  await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Closing',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Current cashier shift'})).toBeVisible();
  await expect(page.getByText('Expected cash',{exact:true}).first()).toBeVisible();
  await page.getByRole('tab',{name:'Six-Month Closing'}).click();
  await expect(page.getByRole('heading',{name:'Six-month review'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Operating profit'})).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../evidence/closing-preview-b04.png')});
  expect(errors).toEqual([]);
 }finally{await app.close()}
});
