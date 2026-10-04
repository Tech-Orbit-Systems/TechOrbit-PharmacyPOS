const {test,expect,_electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');

test('P065 protected audit viewer shows Pakistan and UTC event time on isolated data',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-audit-'))};
  delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.getByLabel('Username',{exact:true}).fill('demo');
    await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.evaluate(()=>window.pharmacy.settingsSave({backupRetentionDays:31}));
    await page.getByRole('button',{name:'Reports',exact:true}).click();
    await page.getByRole('tab',{name:'Audit Log Report',exact:true}).click();
    await expect(page.getByRole('row').filter({hasText:'settings.change'}).first()).toBeVisible();
    const row=page.getByRole('row').filter({hasText:'settings.change'}).first();
    await expect(row).toContainText('PK ');
    await expect(row).toContainText('UTC ');
    await row.getByText('View changes').click();
    await expect(row).toContainText('[Protected configuration/authentication payload]');
    expect(errors).toEqual([]);
  }finally{await app.close()}
});
