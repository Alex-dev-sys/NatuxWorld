import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { electronTools, repositoryRoot, runNode, stageElectron } from './electron-stage.mjs';

const rootTools = createRequire(path.join(repositoryRoot, 'package.json'));
const actions = new Set(['dev', 'build:web', 'build', 'package', 'typecheck', 'test']);

export function validateElectronAction(action, env) {
  if (!actions.has(action)) throw new Error('Usage: node scripts/run-electron.mjs dev|build:web|build|package|typecheck|test [options]');
  if (['build:web', 'build', 'package'].includes(action) &&
      (env.NATUX_LOCAL_MODE === 'true' || env.NATUX_LOCAL_AUTH_API === '1')) {
    throw new Error('Local API overrides are allowed only in development; an Electron rollback package must use the production brand.');
  }
}

function typecheck() {
  runNode(rootTools.resolve('typescript/bin/tsc'), ['-p', 'config/tsconfig.electron.json', '--noEmit']);
}

async function buildWeb() {
  runNode(path.join(repositoryRoot, 'scripts', 'prepare-launcher-icons.mjs'));
  runNode(rootTools.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.app.json']);
  typecheck();
  runNode(path.join(path.dirname(rootTools.resolve('vite/package.json')), 'bin', 'vite.js'), ['build', '--config', 'config/vite.electron.config.ts']);
}

async function main() {
  const action = process.argv[2];
  validateElectronAction(action, process.env);
  process.chdir(repositoryRoot);
  // Fail clearly when the user has not opted into the legacy dependency tree.
  try { electronTools.resolve('electron/package.json'); }
  catch { throw new Error('Optional Electron tools are missing. Run npm run electron:install first.'); }
  const args = process.argv.slice(3);
  if (action === 'typecheck') return typecheck();
  if (action === 'test') return runNode(rootTools.resolve('vitest/vitest.mjs'), ['run', '--config', 'config/vitest.electron.config.ts', ...args]);
  if (action === 'dev') {
    runNode(path.join(repositoryRoot, 'scripts', 'prepare-launcher-icons.mjs'));
    runNode(path.join(repositoryRoot, 'scripts', 'build-lock-runtime.mjs'));
    await stageElectron({ compiled: false });
    return runNode(path.join(path.dirname(rootTools.resolve('vite/package.json')), 'bin', 'vite.js'), ['--config', 'config/vite.electron.config.ts', ...args]);
  }
  if (action !== 'package') await buildWeb();
  if (action === 'build:web') return;
  if (action === 'build') runNode(path.join(repositoryRoot, 'scripts', 'build-lock-runtime.mjs'));
  await stageElectron();
  const electronVersion = electronTools('electron/package.json').version;
  return runNode(electronTools.resolve('electron-builder/cli.js'), [...args, `--config.electronVersion=${electronVersion}`]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
