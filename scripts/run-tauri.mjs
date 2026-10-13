import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriDirectory = path.join(repositoryRoot, 'src', 'native');
const command = process.argv[2];

if (command !== 'dev' && command !== 'build') {
  throw new Error('Usage: npm run tauri:dev | npm run tauri:build [Tauri CLI options]');
}
const cliArgs = process.argv.slice(3);

process.chdir(repositoryRoot);
process.env.TAURI_APP_PATH = tauriDirectory;
process.env.TAURI_FRONTEND_PATH = repositoryRoot;

const require = createRequire(import.meta.url);
const cli = require('@tauri-apps/cli');

try {
  await cli.run([command, ...cliArgs], `npm run tauri:${command}`);
} catch (error) {
  cli.logError(error instanceof Error ? error.message : 'Tauri CLI failed.');
  process.exitCode = 1;
}
