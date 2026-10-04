const { test, expect, _electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function login(page) {
  await page.getByLabel('Username', { exact: true }).fill('demo');
  await page.getByLabel('Password', { exact: true }).fill('TechOrbit-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('Demo Edition is clearly labelled and restores its isolated sample data', async () => {
  const env = {
    ...process.env,
    TECHORBIT_UI_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'techorbit-demo-ready-')),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TECHORBIT_UI_DATABASE;
  const app = await _electron.launch({
    args: [path.resolve(__dirname, '../desktop/main.cjs')],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const anonymousReset=await page.evaluate(async()=>{try{await window.pharmacy.resetDemo();return 'allowed'}catch(error){return {code:error.code,message:error.message}}});
    expect(anonymousReset.code,anonymousReset.message).toBe('ACCESS_DENIED');
    await login(page);
    await expect(page.getByText(/Demo Edition · Sample data only/)).toBeVisible();

    await page.evaluate(() => window.pharmacy.createCustomer({ name: 'Temporary Demo Customer', phone: '03009999999' }));
    let result = await page.evaluate(() => window.pharmacy.customerSearch({ q: '03009999999', page: 1 }));
    expect(result.items).toHaveLength(1);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();

    await login(page);
    result = await page.evaluate(() => window.pharmacy.customerSearch({ q: '03009999999', page: 1 }));
    expect(result.items).toHaveLength(0);
    await expect(page.getByText(/Demo Edition · Isolated sample database/)).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
