import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionConfig } from '../../scripts/run-tauri-validation-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Tauri acceptance validates and retains the production config', async () => {
  const sourceText = await readFile(path.join(root, 'src/native/tauri.conf.json'), 'utf8');
  const source = JSON.parse(sourceText);
  const sourceSnapshot = JSON.parse(JSON.stringify(source));
  validateProductionConfig(source, ['--bundles', 'nsis']);

  assert.deepEqual(source, sourceSnapshot);
  assert.equal(source.app.windows[0].additionalBrowserArgs, undefined);
});

test('Tauri acceptance rejects debug configs and CLI config replacement', () => {
  const source = { app: { windows: [{ label: 'main' }] } };
  for (const argument of ['--config', '--config=test.json', '-c']) {
    assert.throws(() => validateProductionConfig(source, [argument]), /must not replace/);
  }
  assert.throws(() => validateProductionConfig({ app: { windows: [] } }), /main application window/);
  source.app.windows[0].additionalBrowserArgs = '--remote-debugging-port=9222';
  assert.throws(() => validateProductionConfig(source), /without test browser arguments/);
});
