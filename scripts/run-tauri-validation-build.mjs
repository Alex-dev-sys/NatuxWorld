import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeDirectory = path.join(repositoryRoot, 'src', 'native');
const sourceConfigPath = path.join(nativeDirectory, 'tauri.conf.json');
const tauriRunnerPath = path.join(repositoryRoot, 'scripts', 'run-tauri.mjs');

export function validateProductionConfig(sourceConfig, cliArgs = []) {
  const mainWindow = sourceConfig.app?.windows?.find((window) => window.label === 'main');
  if (!mainWindow) throw new Error('Tauri validation config requires the main application window.');
  if (sourceConfig.app.windows.some((window) => window.additionalBrowserArgs !== undefined)) {
    throw new Error('Packaged acceptance must use production windows without test browser arguments.');
  }
  if (cliArgs.some((argument) => argument === '--config' || argument.startsWith('--config=') || argument === '-c')) {
    throw new Error('Packaged acceptance must not replace the production Tauri config.');
  }
}

async function main() {
  const sourceConfig = JSON.parse(await readFile(sourceConfigPath, 'utf8'));
  validateProductionConfig(sourceConfig, process.argv.slice(2));
  // CDP is enabled only in the test child's environment. The tested installer
  // embeds exactly the production config and remains usable for publication.
  const result = spawnSync(process.execPath, [tauriRunnerPath, 'build', ...process.argv.slice(2)], {
    cwd: repositoryRoot,
    env: { ...process.env, NATUX_TAURI_UPDATES_ENABLED: '0' },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Tauri validation build stopped by ${result.signal}.`);
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
