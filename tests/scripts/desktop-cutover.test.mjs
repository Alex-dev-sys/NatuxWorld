import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { tauriEnvironment } from '../../scripts/run-tauri.mjs';

test('development uses the same local API in Rust and the renderer, and release cannot retain overrides', () => {
  assert.equal(tauriEnvironment('dev', { NATUX_LOCAL_MODE: 'true' }).NATUX_LOCAL_AUTH_API, '1');
  assert.equal(tauriEnvironment('dev', {}).NATUX_TAURI_UPDATES_ENABLED, '0');
  assert.equal(tauriEnvironment('build', {}).NATUX_TAURI_UPDATES_ENABLED, '1');
  assert.equal(tauriEnvironment('build', { NATUX_TAURI_UPDATES_ENABLED: '0' }).NATUX_TAURI_UPDATES_ENABLED, '0');
  assert.throws(() => tauriEnvironment('build', { NATUX_LOCAL_MODE: 'true' }), /production brand/);
  assert.throws(() => tauriEnvironment('build', { NATUX_LOCAL_AUTH_API: '1' }), /production brand/);
  assert.throws(() => tauriEnvironment('build', { NATUX_TAURI_UPDATES_ENABLED: 'yes' }), /0 or 1/);
});

test('standard desktop commands use Tauri while rollback is explicit', async () => {
  const metadata = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(metadata.main, undefined);
  assert.match(metadata.scripts.dev, /tauri:dev/);
  assert.match(metadata.scripts.build, /run-tauri\.mjs build/);
  assert.doesNotMatch(metadata.scripts.build, /electron/);
  assert.match(metadata.scripts['test:packaged'], /tauri-packaged/);
  assert.match(metadata.scripts['electron:build'], /run-electron\.mjs build/);
});
