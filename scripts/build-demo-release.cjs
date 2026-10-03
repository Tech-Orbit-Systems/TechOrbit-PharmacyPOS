const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const packager = require('@electron/packager');
const archiver = require('archiver');
const { createWindowsInstaller } = require('electron-winstaller');

const root = path.resolve(__dirname, '..');
const stage = path.join(root, '.demo-package-stage');
const releaseRoot = path.join(root, 'releases', 'demo');
const portableRoot = path.join(releaseRoot, 'portable');
const installerRoot = path.join(releaseRoot, 'installer');
const version = '0.9.0';
const productName = 'TechOrbit Pharmacy POS Demo';

function assertInside(target, parent, label) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`${label} must stay inside ${parent}`);
}

async function copy(source, destination) {
  await fsp.cp(source, destination, { recursive: true, force: true });
}

function runNodeScript(script, args, cwd) {
  execFileSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
}

async function zipDirectory(source, destination) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(source, path.basename(source));
    archive.finalize();
  });
}

async function main() {
  assertInside(stage, root, 'Stage directory');
  assertInside(releaseRoot, root, 'Release directory');
  await fsp.rm(stage, { recursive: true, force: true });
  await fsp.rm(releaseRoot, { recursive: true, force: true });
  await fsp.mkdir(path.join(stage, 'modernization'), { recursive: true });
  await fsp.mkdir(path.join(stage, 'assets', 'images'), { recursive: true });
  await copy(path.join(root, 'modernization', 'desktop'), path.join(stage, 'modernization', 'desktop'));
  await copy(path.join(root, 'modernization', 'dist'), path.join(stage, 'modernization', 'dist'));
  await copy(path.join(root, 'infrastructure'), path.join(stage, 'infrastructure'));
  await copy(path.join(root, 'assets', 'images', 'icon.ico'), path.join(stage, 'assets', 'images', 'icon.ico'));
  await copy(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
  await fsp.writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: 'techorbit-pharmacy-pos-demo',
    productName,
    version,
    description: 'Portable client demonstration build with isolated sample data',
    author: 'Tech Orbit Systems',
    license: 'MIT',
    main: 'modernization/desktop/main.cjs',
    dependencies: {
      bcrypt: 'npm:bcryptjs@^2.4.3',
      'better-sqlite3': '^13.0.3',
      exceljs: '4.4.0',
      jspdf: '^4.2.1',
    },
  }, null, 2));

  const npmCli = process.env.npm_execpath || require.resolve('npm/bin/npm-cli.js');
  runNodeScript(npmCli, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage);
  await fsp.rm(path.join(stage, 'node_modules', 'better-sqlite3'), { recursive: true, force: true });
  await copy(path.join(root, 'node_modules', 'better-sqlite3'), path.join(stage, 'node_modules', 'better-sqlite3'));

  await fsp.mkdir(portableRoot, { recursive: true });
  const packagePaths = await packager({
    dir: stage,
    out: portableRoot,
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    name: productName,
    appVersion: version,
    electronVersion: require('electron/package.json').version,
    icon: path.join(stage, 'assets', 'images', 'icon.ico'),
    asar: { unpack: '**/*.node' },
    prune: false,
    win32metadata: {
      CompanyName: 'Tech Orbit Systems',
      FileDescription: productName,
      ProductName: productName,
      InternalName: 'TechOrbitPharmacyPOSDemo',
      OriginalFilename: 'TechOrbit Pharmacy POS Demo.exe',
    },
  });
  const appDirectory = packagePaths[0];
  const portableZip = path.join(releaseRoot, `TechOrbit-PharmacyPOS-Demo-${version}-Portable.zip`);
  await zipDirectory(appDirectory, portableZip);

  await fsp.mkdir(installerRoot, { recursive: true });
  await createWindowsInstaller({
    appDirectory,
    outputDirectory: installerRoot,
    authors: 'Tech Orbit Systems',
    description: 'TechOrbit Pharmacy POS client demonstration build',
    exe: 'TechOrbit Pharmacy POS Demo.exe',
    setupExe: `TechOrbit-PharmacyPOS-Demo-${version}-Setup.exe`,
    setupIcon: path.join(stage, 'assets', 'images', 'icon.ico'),
    noMsi: true,
  });
  await copy(path.join(root, 'docs', 'demo-edition-guide.md'), path.join(releaseRoot, 'DEMO-GUIDE-ROMAN-URDU.md'));

  const artifacts = [portableZip, path.join(installerRoot, `TechOrbit-PharmacyPOS-Demo-${version}-Setup.exe`)];
  const manifest = [];
  for (const artifact of artifacts) {
    const buffer = await fsp.readFile(artifact);
    manifest.push({
      file: path.relative(releaseRoot, artifact).replaceAll('\\', '/'),
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    });
  }
  await fsp.writeFile(path.join(releaseRoot, 'SHA256SUMS.json'), JSON.stringify({ productName, version, generatedAt: new Date().toISOString(), artifacts: manifest }, null, 2));
  console.log(JSON.stringify({ releaseRoot, appDirectory, artifacts: manifest }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
