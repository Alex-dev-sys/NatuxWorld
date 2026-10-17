import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriDirectory = path.join(repositoryRoot, 'src', 'native');
export function tauriEnvironment(command, env) {
  if (command !== 'dev' && command !== 'build') {
    throw new Error('Usage: npm run dev | npm run build [Tauri CLI options]');
  }
  const localMode = env.NATUX_LOCAL_MODE === 'true';
  if (command === 'build' && (localMode || env.NATUX_LOCAL_AUTH_API === '1')) {
    throw new Error('Local API overrides are allowed only in development; a packaged build must use the production brand.');
  }
  const updates = env.NATUX_TAURI_UPDATES_ENABLED ?? (command === 'build' ? '1' : '0');
  if (updates !== '0' && updates !== '1') throw new Error('NATUX_TAURI_UPDATES_ENABLED must be 0 or 1.');
  return {
    ...env,
    TAURI_APP_PATH: tauriDirectory,
    TAURI_FRONTEND_PATH: repositoryRoot,
    NATUX_LOCAL_AUTH_API: localMode ? '1' : '0',
    NATUX_TAURI_UPDATES_ENABLED: updates,
  };
}

async function main() {
  const command = process.argv[2];
  Object.assign(process.env, tauriEnvironment(command, process.env));
  process.chdir(repositoryRoot);
  const require = createRequire(import.meta.url);
  const cli = require('@tauri-apps/cli');
  try {
    await cli.run([command, ...process.argv.slice(3)], `npm run tauri:${command}`);
  } catch (error) {
    cli.logError(error instanceof Error ? error.message : 'Tauri CLI failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
