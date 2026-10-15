import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { packageTauriPortable } from '../../scripts/package-tauri-portable.mjs';

test('portable archive includes only native runtime and explicit local-profile marker', {
  skip: process.platform !== 'win32' || process.arch !== 'x64',
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'natux-portable-package-'));
  try {
    await mkdir(path.join(root, 'src/native/target/release'), { recursive: true });
    await mkdir(path.join(root, 'build/lock-runtime'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.9.15' }));
    await writeFile(path.join(root, 'src/native/target/release/natux-world-launcher-native.exe'), 'MZ fixture');
    await writeFile(path.join(root, 'build/lock-runtime/natux-lock-agent.jar'), 'PK fixture');
    const archive = await packageTauriPortable(root);
    assert.equal((await readFile(archive)).subarray(0, 2).toString(), 'PK');
    const extract = path.join(root, 'extracted');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('../../scripts/extract-tauri-portable.ps1', import.meta.url)),
      '-Archive', archive, '-DestinationDirectory', extract],
    { windowsHide: true, stdio: 'pipe' });
    assert.deepEqual((await readdir(extract)).sort(), ['Start NATUX WORLD.cmd', 'natux-lock', 'natux-portable.json', 'natux-world-launcher-native.exe', 'start-portable.ps1']);
    assert.deepEqual(JSON.parse(await readFile(path.join(extract, 'natux-portable.json'), 'utf8')),
      { schemaVersion: 1, profileDirectory: 'profile' });
    assert.deepEqual(await readdir(path.join(root, 'release/tauri')), [path.basename(archive)]);
    const runtime = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      path.join(extract, 'start-portable.ps1'), '-CheckRuntimeOnly'], { windowsHide: true, encoding: 'utf8' }));
    assert.equal(typeof runtime.available, 'boolean');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
