import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveElectronPackageDir() {
  const packageJsonPath = require.resolve('electron/package.json');
  return path.dirname(packageJsonPath);
}

function readElectronExecutableName(packageDir) {
  const pathFile = path.join(packageDir, 'path.txt');
  if (!fs.existsSync(pathFile)) return null;
  return fs.readFileSync(pathFile, 'utf8').trim() || null;
}

function hasInstalledElectronBinary(packageDir) {
  const executableName = readElectronExecutableName(packageDir);
  if (!executableName) return false;
  return fs.existsSync(path.join(packageDir, 'dist', executableName));
}

function runElectronInstaller(packageDir) {
  const installScript = path.join(packageDir, 'install.js');
  const result = spawnSync(process.execPath, [installScript], {
    cwd: packageDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const electronPackageDir = resolveElectronPackageDir();

if (!hasInstalledElectronBinary(electronPackageDir)) {
  console.log('Electron binary is missing. Re-running the Electron installer...');
  runElectronInstaller(electronPackageDir);
}

if (!hasInstalledElectronBinary(electronPackageDir)) {
  console.error('Electron is still not installed correctly after reinstalling.');
  process.exit(1);
}
