import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { planLockRuntimeBuild } from '../../scripts/build-lock-runtime.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('default helper builds keep each host executable name and native Cargo artifact path', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const plan = planLockRuntimeBuild(platform, undefined);
    const executable = platform === 'win32' ? 'lock-helper.exe' : 'lock-helper';
    assert.equal(plan.executableName, executable);
    assert.equal(plan.cargoArgs.includes('--target'), false);
    assert.equal(plan.rustHelper, path.join(repositoryRoot, 'build', 'lock-rust-target', 'release', executable));
    assert.equal(plan.targetDirectory, path.join(repositoryRoot, 'build', 'lock-rust-target'));
  }
});

test('explicit macOS architectures select their own Cargo target and matching helper artifact', () => {
  const helpers = new Set();
  for (const target of ['x86_64-apple-darwin', 'aarch64-apple-darwin']) {
    const plan = planLockRuntimeBuild('darwin', target);
    assert.deepEqual(plan.cargoArgs.slice(-2), ['--target', target]);
    assert.equal(plan.rustHelper, path.join(repositoryRoot, 'build', 'lock-rust-target', target, 'release', 'lock-helper'));
    assert.equal(plan.executableName, 'lock-helper');
    helpers.add(plan.rustHelper);
  }
  assert.equal(helpers.size, 2, 'ARM and Intel packaging must not copy the same host helper artifact.');
});

test('target overrides reject foreign hosts and malformed or unsupported targets before building', () => {
  for (const target of ['', ' x86_64-apple-darwin', 'x86_64-apple-darwin ', 'X86_64-APPLE-DARWIN',
    '../release', 'x86_64-apple-darwin/../../release', 'aarch64-unknown-linux-gnu', 'x86_64-pc-windows-msvc', null, 123]) {
    assert.throws(() => planLockRuntimeBuild('darwin', target), /must be exactly/, String(target));
  }
  for (const host of ['win32', 'linux']) {
    for (const target of ['x86_64-apple-darwin', 'aarch64-apple-darwin']) {
      assert.throws(() => planLockRuntimeBuild(host, target), /only on a macOS/, `${host}: ${target}`);
    }
  }
});

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
