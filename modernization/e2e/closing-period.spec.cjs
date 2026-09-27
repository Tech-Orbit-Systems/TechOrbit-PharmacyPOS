const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');

test('B04 configured six-month close, history and custom range persist',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-six-month-'));
 const env={...process.env,TECHORBIT_UI_DATA_DIR:dataDir,TECHORBIT_DISABLE_HARDWARE_ACCELERATION:'1'};
 delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
 const launch=()=>_electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
 let app=await launch();
 try{
  let page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const signIn=async()=>{await page.getByLabel('Username',{exact:true}).fill('demo');await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Closing',exact:true}).click();await page.getByRole('tab',{name:'Six-Month Closing'}).click()};
  await signIn();
  await page.getByRole('button',{name:'Latest completed cycle'}).click();
  await expect(page.getByRole('button',{name:'Official six-month close'})).toBeEnabled();
  await page.getByLabel('Official period close note').fill('Reviewed cycle totals');
  await page.getByRole('button',{name:'Official six-month close'}).click();
  await expect(page.getByRole('heading',{name:'Six-month closing history'})).toBeVisible();
  await page.getByRole('button',{name:'View',exact:true}).first().click();
  await expect(page.getByText(/Original report and 0 revisions retained/)).toBeVisible();
  await page.getByLabel('From (Pakistan date/time)').fill('2026-04-01T00:00');
  await page.getByLabel('To, exclusive (Pakistan date/time)').fill('2026-05-01T00:00');
  await page.getByRole('button',{name:'Show custom range'}).click();
  await expect(page.getByText(/2026-04-01 to 2026-04-30/)).toBeVisible();
  const exportPath=path.join(dataDir,'period.csv');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},exportPath);
  await page.getByRole('button',{name:'Export period CSV'}).click();
  await expect(page.getByText('Six-month CSV report saved.')).toBeVisible();
  const csv=fs.readFileSync(exportPath,'utf8');expect(csv).toContain('"2026-04"');expect(csv).toContain('"Total"');
  expect(errors).toEqual([]);
  await app.close();app=await launch();page=await app.firstWindow();await signIn();
  await page.getByRole('button',{name:'View',exact:true}).first().click();
  await expect(page.getByText(/Original report and 0 revisions retained/)).toBeVisible();
 }finally{await app.close()}
});
