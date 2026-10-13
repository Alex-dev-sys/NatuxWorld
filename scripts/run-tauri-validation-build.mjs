import { spawnSync } from 'node:child_process';
import { open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeDirectory = path.join(repositoryRoot, 'src', 'native');
const sourceConfigPath = path.join(nativeDirectory, 'tauri.conf.json');
const generatedConfigPath = path.join(nativeDirectory, 'tauri.validation.generated.conf.json');
const generatedConfigRelativePath = path.relative(repositoryRoot, generatedConfigPath).replaceAll(path.sep, '/');
const tauriRunnerPath = path.join(repositoryRoot, 'scripts', 'run-tauri.mjs');
const defaultBrowserArgs = '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required';

export function createTauriValidationConfig(sourceConfig, debugPort) {
  if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65535) {
    throw new RangeError('Tauri validation CDP port must be an integer from 1024 through 65535.');
  }

  const config = JSON.parse(JSON.stringify(sourceConfig));
  const mainWindow = config.app?.windows?.find((window) => window.label === 'main');
  if (!mainWindow) throw new Error('Tauri validation config requires the main application window.');

  mainWindow.additionalBrowserArgs = `${defaultBrowserArgs} --remote-debugging-port=${debugPort}`;
  return config;
}

async function main() {
  const debugPort = Number(process.env.NATUX_TAURI_E2E_DEBUG_PORT || 9222);
  const sourceConfig = JSON.parse(await readFile(sourceConfigPath, 'utf8'));
  const validationConfig = createTauriValidationConfig(sourceConfig, debugPort);
  let generatedConfig;
  let ownsGeneratedConfig = false;

  try {
    generatedConfig = await open(generatedConfigPath, 'wx');
    ownsGeneratedConfig = true;
    await generatedConfig.writeFile(`${JSON.stringify(validationConfig, null, 2)}\n`, 'utf8');
    await generatedConfig.close();
    generatedConfig = undefined;

    const result = spawnSync(process.execPath, [
      tauriRunnerPath,
      'build',
      '--config',
      generatedConfigRelativePath,
      ...process.argv.slice(2),
    ], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });

    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Tauri validation build stopped by ${result.signal}.`);
    process.exitCode = result.status ?? 1;
  } finally {
    await generatedConfig?.close();
    if (ownsGeneratedConfig) await rm(generatedConfigPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
