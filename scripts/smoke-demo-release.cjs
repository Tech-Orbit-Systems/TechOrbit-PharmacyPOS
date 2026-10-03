const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('../modernization/node_modules/@playwright/test');

async function main() {
  const root = path.resolve(__dirname, '..');
  const executablePath = process.env.TECHORBIT_DEMO_EXE || path.join(root, 'releases', 'demo', 'portable', 'TechOrbit Pharmacy POS Demo-win32-x64', 'TechOrbit Pharmacy POS Demo.exe');
  if (!fs.existsSync(executablePath)) throw new Error(`Packaged executable not found: ${executablePath}`);
  const env = {
    ...process.env,
    TECHORBIT_UI_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'techorbit-packaged-smoke-')),
    TECHORBIT_E2E_COMPATIBILITY: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TECHORBIT_UI_DATABASE;
  const app = await electron.launch({ executablePath, env });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByLabel('Username', { exact: true }).fill('demo');
    await page.getByLabel('Password', { exact: true }).fill('TechOrbit-Demo-2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText(/Demo Edition · Sample data only/).waitFor();
    await page.getByRole('button', { name: 'Point of Sale', exact: true }).click();
    await page.getByLabel('Scan barcode or search medicine', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await page.getByRole('heading', { name: 'Profit and Loss Report', exact: true }).waitFor();
    if (errors.length) throw new Error(`Renderer errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ executablePath, login: 'pass', pos: 'pass', reports: 'pass', rendererErrors: 0 }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
