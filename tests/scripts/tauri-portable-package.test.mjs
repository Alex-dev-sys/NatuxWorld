import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { packageTauriPortable } from '../../scripts/package-tauri-portable.mjs';

test('portable archive includes only native runtime and explicit local-profile marker', {
  skip: process.platform !== 'win32' || process.arch !== 'x64',
}, async () => {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, 'natux-portable-webview-package-'));
  try {
    await mkdir(path.join(root, 'src/native/target/release'), { recursive: true });
    await mkdir(path.join(root, 'build/lock-runtime'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.9.15' }));
    await writeFile(path.join(root, 'src/native/target/release/natux-world-launcher-native.exe'), 'MZ fixture');
    await writeFile(path.join(root, 'build/lock-runtime/natux-lock-agent.jar'), 'PK fixture');
    const archive = await packageTauriPortable(root);
    assert.equal((await readFile(archive)).subarray(0, 2).toString(), 'PK');
    const inspection = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(`
        $ErrorActionPreference = 'Stop'
        $ProgressPreference = 'SilentlyContinue'
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead('${archive.replaceAll("'", "''")}')
        try {
          $entries = @($zip.Entries | ForEach-Object {
            $stream = $_.Open(); $hash = [Security.Cryptography.SHA512]::Create()
            try { @{ name = $_.FullName; sha512 = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } }
            finally { $hash.Dispose(); $stream.Dispose() }
          })
          @{ powershellMajor = $PSVersionTable.PSVersion.Major; entries = $entries } | ConvertTo-Json -Depth 4 -Compress
        } finally { $zip.Dispose() }
      `, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 30_000 }));
    assert.equal(inspection.powershellMajor, 5, 'Regression must cover actual Windows PowerShell 5 .NET compatibility behavior.');
    const expected = new Map([
      ['natux-world-launcher-native.exe', Buffer.from('MZ fixture')],
      ['natux-lock/natux-lock-agent.jar', Buffer.from('PK fixture')],
      ['start-portable.ps1', await readFile(fileURLToPath(new URL('../../scripts/start-tauri-portable.ps1', import.meta.url)))],
      ['Start NATUX WORLD.cmd', await readFile(fileURLToPath(new URL('../../scripts/start-tauri-portable.cmd', import.meta.url)))],
      ['natux-portable.json', Buffer.from(`${JSON.stringify({ schemaVersion: 1, profileDirectory: 'profile' })}\n`)],
    ]);
    assert.deepEqual(inspection.entries.map(entry => entry.name).sort(), [...expected.keys()].sort(), 'ZIP FullName must use canonical forward slashes.');
    for (const entry of inspection.entries) {
      assert.equal(entry.sha512, createHash('sha512').update(expected.get(entry.name)).digest('hex'), `Unmodified bytes: ${entry.name}`);
    }
    const strict = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('../e2e/tauri-portable-webview-ui.ps1', import.meta.url)),
      '-Action', 'Extract', '-OwnerRoot', root, '-Archive', archive],
    { env: { ...process.env, TEMP: parent, TMP: parent }, windowsHide: true, encoding: 'utf8', timeout: 30_000 }));
    assert.equal(strict.extracted, true);
    assert.equal(strict.fileCount, 5);
    assert.equal(await readFile(path.join(root, 'app/natux-lock/natux-lock-agent.jar'), 'utf8'), 'PK fixture');
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
    // A stale payload is ignored by normal standalone builds. CI must request
    // the exact captured NSIS executable explicitly, retaining its signature.
    const captured = path.join(root, 'src/native/target/release/natux-world-launcher-native.exe.nsis-payload.exe');
    await writeFile(captured, 'MZ patched and signed fixture');
    await assert.rejects(() => packageTauriPortable(root, { nsisPayload: 'true' }), /must be boolean/);
    const payloadArchive = await packageTauriPortable(root, { nsisPayload: true });
    const payloadExtract = path.join(root, 'payload-extracted');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('../../scripts/extract-tauri-portable.ps1', import.meta.url)),
      '-Archive', payloadArchive, '-DestinationDirectory', payloadExtract], { windowsHide: true, stdio: 'pipe' });
    assert.equal(await readFile(path.join(payloadExtract, 'natux-world-launcher-native.exe'), 'utf8'), 'MZ patched and signed fixture');
    const standaloneArchive = await packageTauriPortable(root);
    const standaloneExtract = path.join(root, 'standalone-extracted');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('../../scripts/extract-tauri-portable.ps1', import.meta.url)),
      '-Archive', standaloneArchive, '-DestinationDirectory', standaloneExtract], { windowsHide: true, stdio: 'pipe' });
    assert.equal(await readFile(path.join(standaloneExtract, 'natux-world-launcher-native.exe'), 'utf8'), 'MZ fixture');
  } finally {
    assert.equal((await realpath(root)).toLowerCase(), root.toLowerCase());
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith('natux-portable-webview-package-'));
    assert.equal((await lstat(root)).isSymbolicLink(), false);
    await rm(root, { recursive: true, force: true });
  }
});
