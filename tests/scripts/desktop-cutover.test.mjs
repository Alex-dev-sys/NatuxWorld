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

test('rollback package names remain identical locally, in updater metadata and on GitHub', async () => {
  const config = await readFile(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  assert.match(config, /^appId: world\.natux\.launcher$/m);
  assert.match(config, /^productName: NATUX WORLD$/m);
  const templates = [...config.matchAll(/^ {2}artifactName: (.+)$/gm)].map(match => match[1]);
  assert.equal(templates.length, 4);
  const names = templates.map(template => template.replaceAll('${version}', '1.10.0')
    .replaceAll('${arch}', 'x64').replaceAll('${ext}', 'exe'));
  for (const name of names) {
    assert.match(name, /^[A-Za-z0-9._-]+$/, 'Release upload must not rename a package referenced by updater metadata.');
  }
  assert.equal(names[0], 'NATUX-WORLD-Setup-1.10.0-x64.exe');
  assert.equal(names[1], 'NATUX-WORLD-Portable-1.10.0-x64.exe');
  assert.equal(templates[2], templates[3], 'macOS package metadata and DMG use the same stable name.');
});
