import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTauriValidationConfig } from '../../scripts/run-tauri-validation-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Tauri validation config enables local CDP without changing the release config', async () => {
  const sourceText = await readFile(path.join(root, 'src/native/tauri.conf.json'), 'utf8');
  const source = JSON.parse(sourceText);
  const sourceSnapshot = JSON.parse(JSON.stringify(source));
  const validation = createTauriValidationConfig(source, 9222);

  assert.deepEqual(source, sourceSnapshot);
  assert.equal(source.app.windows[0].additionalBrowserArgs, undefined);
  assert.match(
    validation.app.windows[0].additionalBrowserArgs,
    /^--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --remote-debugging-port=9222$/,
  );
  assert.deepEqual(validation.app.windows[0], {
    ...source.app.windows[0],
    additionalBrowserArgs: validation.app.windows[0].additionalBrowserArgs,
  });
});

test('Tauri validation config rejects unsafe or invalid debug ports', () => {
  const source = { app: { windows: [{ label: 'main' }] } };
  for (const port of [0, 922, 65536, 9222.5, Number.NaN]) {
    assert.throws(() => createTauriValidationConfig(source, port), RangeError);
  }
  assert.throws(() => createTauriValidationConfig({ app: { windows: [] } }, 9222), /main application window/);
});
