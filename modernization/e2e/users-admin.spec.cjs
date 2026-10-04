const {test,expect,_electron}=require('@playwright/test');
const fs=require('fs'),path=require('path'),os=require('os');
test('P063 admin creates an isolated cashier and first-login password change is enforced',async()=>{
  const env={...process.env,TECHORBIT_UI_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'techorbit-users-'))};
  delete env.ELECTRON_RUN_AS_NODE;delete env.TECHORBIT_UI_DATABASE;
  const app=await _electron.launch({args:[path.resolve(__dirname,'../desktop/main.cjs')],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.getByLabel('Username',{exact:true}).fill('demo');
    await page.getByLabel('Password',{exact:true}).fill('TechOrbit-Demo-2026!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Users and roles'})).toBeVisible();
    const form=page.locator('.users-admin form').first();
    await form.getByLabel('Username').fill('e2e-cashier');
    await form.getByLabel('Display name').fill('E2E Cashier');
    await form.getByLabel('Role').selectOption('cashier');
    await form.getByRole('button',{name:'Create account'}).click();
    await expect(page.getByText('Account created. Copy the temporary password now; it will not be shown again.')).toBeVisible();
    const temporary=await page.locator('.temporary-password code').innerText();
    await expect(page.getByText('E2E Cashier')).toBeVisible();
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.getByLabel('Username',{exact:true}).fill('e2e-cashier');
    await page.getByLabel('Password',{exact:true}).fill(temporary);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Change temporary password'})).toBeVisible();
    await page.getByLabel('Password',{exact:true}).fill(temporary);
    await page.getByLabel('New password').fill('E2E-Cashier-Unique-2026!');
    await page.getByRole('button',{name:'Save password'}).click();
    // bcrypt hashing and worker IPC may take longer on a loaded Windows test host.
    await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeVisible({timeout:20000});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Users and roles'})).toHaveCount(0);
    expect(errors).toEqual([]);
  }finally{await app.close()}
});
