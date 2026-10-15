import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';
import { prepareLauncherIcons } from '../../scripts/prepare-launcher-icons.mjs';

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png fixture'),
]);
const ico = Buffer.concat([Buffer.from([0x00, 0x00, 0x01, 0x00]), Buffer.from('ico fixture')]);

async function withTemporaryRoot(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'natuxworld-icons-'));
  try {
    await mkdir(path.join(root, 'public'), { recursive: true });
    await mkdir(path.join(root, 'src/native/icons'), { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('copies the tracked browser and Tauri icon inputs into Electron resources', async () => {
  await withTemporaryRoot(async (root) => {
    await writeFile(path.join(root, 'public/icon.png'), png);
    await writeFile(path.join(root, 'src/native/icons/icon.ico'), ico);

    const copied = await prepareLauncherIcons(root);

    assert.deepEqual(copied, [
      { source: 'public/icon.png', destination: 'build/icon.png' },
      { source: 'src/native/icons/icon.ico', destination: 'build/icon.ico' },
    ]);
    assert.deepEqual(await readFile(path.join(root, 'build/icon.png')), png);
    assert.deepEqual(await readFile(path.join(root, 'build/icon.ico')), ico);
  });
});

test('validates all icon inputs before writing packaging outputs', async () => {
  await withTemporaryRoot(async (root) => {
    await writeFile(path.join(root, 'public/icon.png'), Buffer.from('not a png'));
    await writeFile(path.join(root, 'src/native/icons/icon.ico'), ico);

    await assert.rejects(prepareLauncherIcons(root), /Invalid launcher icon input: public\/icon\.png/);
    await assert.rejects(readFile(path.join(root, 'build/icon.png')), { code: 'ENOENT' });
  });
});

test('renderer and Electron build commands prepare their tracked icon inputs', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const tauriConfig = JSON.parse(
    await readFile(new URL('../../src/native/tauri.conf.json', import.meta.url), 'utf8'),
  );

  for (const command of ['build', 'build:tauri:web']) {
    assert.match(packageJson.scripts[command], /npm run prepare:icons/);
  }
  assert.match(packageJson.scripts['electron:build:web'], /run-electron\.mjs build:web/);
  assert.equal(tauriConfig.build.beforeBuildCommand, 'npm run build:tauri:web');
});
