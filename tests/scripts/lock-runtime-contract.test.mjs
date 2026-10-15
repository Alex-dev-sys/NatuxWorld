import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('all desktop package entry points prepare the lock runtime before bundling', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts;
  assert.equal(scripts['build:lock-runtime'], 'node scripts/build-lock-runtime.mjs');
  assert.match(scripts.build, /build:lock-runtime.*run-tauri\.mjs build/);
  assert.match(scripts['electron:build'], /run-electron\.mjs build/);
  assert.match(scripts['tauri:dev'], /build:lock-runtime.*run-tauri\.mjs dev/);
  assert.match(scripts['tauri:build'], /build:lock-runtime.*run-tauri\.mjs build/);
  assert.match(scripts['tauri:build:updater'], /build:lock-runtime.*run-tauri\.mjs build/);
});

test('Electron and Tauri bundle the resources at the paths resolved by their hosts', async () => {
  const [electronBuilder, tauriConfig, signedElectronConfig] = await Promise.all([
    readFile(path.join(repositoryRoot, 'electron-builder.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src/native/tauri.conf.json'), 'utf8'),
    readFile(path.join(repositoryRoot, 'config/electron-builder.signed.cjs'), 'utf8'),
  ]);
  const tauri = JSON.parse(tauriConfig);

  assert.match(electronBuilder, /from:\s*build\/lock-runtime[\s\S]*?to:\s*natux-lock/);
  assert.match(electronBuilder, /lock-helper\*/);
  assert.match(electronBuilder, /natux-lock-agent\.jar/);
  assert.equal(
    tauri.bundle.resources['../../build/lock-runtime/natux-lock-agent.jar'],
    'natux-lock/natux-lock-agent.jar',
  );
  assert.match(signedElectronConfig, /Contents\/Resources\/natux-lock\/lock-helper/);
});
