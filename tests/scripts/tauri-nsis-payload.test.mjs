import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const capture = path.join(repository, 'scripts', 'capture-tauri-nsis-payload.ps1');
const hook = path.join(repository, 'config', 'tauri-installer-hooks.nsh');
const compiler = path.join(process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe');
const target = path.join(repository, 'src', 'native', 'target');
const basename = 'natux-world-launcher-native.exe';

function execute(executable, args) {
  try {
    return { status: 0, output: execFileSync(executable, args,
      { encoding: 'utf8', windowsHide: true, stdio: 'pipe', timeout: 60_000 }) };
  } catch (error) {
    if (typeof error.status !== 'number') throw error;
    return { status: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function captureFile(source) {
  return execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Source', source]);
}

function fixtureBytes(marker = 'NSS', count = 2) {
  const bytes = Buffer.alloc(4096);
  bytes.write('MZ');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80);
  bytes.writeUInt16LE(0x8664, 0x84);
  bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt16LE(240, 0x94);
  bytes.writeUInt16LE(0x20b, 0x98);
  for (let index = 0; index < count; index++) bytes.write(`__TAURI_BUNDLE_TYPE_VAR_${marker}`, 1024 + 256 * index);
  return bytes;
}

function sha512(bytes) { return createHash('sha512').update(bytes).digest('hex'); }
function nsis(value) { return value.replaceAll('$', '$$').replaceAll('"', '$\\"'); }

async function ownedFixture(t) {
  await mkdir(target, { recursive: true });
  const owner = path.join(target, `nsis-payload-fixture-${randomUUID()}`);
  await mkdir(owner);
  t.after(async () => {
    const actual = await realpath(owner);
    assert.equal(path.dirname(actual).toLowerCase(), (await realpath(target)).toLowerCase());
    assert.ok(path.basename(actual).startsWith('nsis-payload-fixture-'));
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  return owner;
}

test('production NSIS hook captures only when the real main binary source exists', async () => {
  const source = await readFile(hook, 'utf8');
  assert.match(source, /!define NATUX_BUILD_HOOK_DIR "\$\{__FILEDIR__\}"/);
  assert.match(source, /!macro NSIS_HOOK_PREINSTALL\s+[\s\S]*?!ifdef MAINBINARYSRCPATH/);
  assert.match(source, /!system 'powershell\.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "\$\{NATUX_BUILD_HOOK_DIR\}\\\.\.\\scripts\\capture-tauri-nsis-payload\.ps1" -Source "\$\{MAINBINARYSRCPATH\}"' = 0/);
});

test('capture preserves exact PE bytes and rejects unpatched or unsafe input paths', { skip: process.platform !== 'win32' }, async (t) => {
  const owner = await ownedFixture(t);
  const source = path.join(owner, basename);
  const payload = `${source}.nsis-payload.exe`;
  const bytes = fixtureBytes();
  await writeFile(source, bytes);
  const result = captureFile(source);
  assert.equal(result.status, 0, result.output);
  const receipt = JSON.parse(result.output);
  assert.equal(receipt.path, payload);
  assert.equal(receipt.sha512, sha512(bytes));
  assert.deepEqual(await readFile(source), bytes);
  assert.deepEqual(await readFile(payload), bytes);
  // An unrelated previous artifact must be replaced with a new exact copy.
  await writeFile(payload, 'stale previous build');
  assert.equal(captureFile(source).status, 0);
  assert.deepEqual(await readFile(payload), bytes);
  for (const invalid of [fixtureBytes('UNK'), fixtureBytes('NSS', 1), Buffer.from('MZ not a complete PE')]) {
    await writeFile(source, invalid);
    assert.notEqual(captureFile(source).status, 0);
    assert.deepEqual(await readFile(payload), bytes, 'failure must preserve the last verified capture');
  }
  await writeFile(source, bytes);
  const wrong = path.join(owner, 'wrong.exe');
  await writeFile(wrong, bytes);
  for (const invalid of [wrong, path.join(repository, 'scripts', basename),
    `${owner}\\sub\\..\\${basename}`, basename]) assert.notEqual(captureFile(invalid).status, 0, invalid);
  const junction = path.join(owner, 'junction');
  const nested = path.join(owner, 'real directory');
  await mkdir(nested);
  await writeFile(path.join(nested, basename), bytes);
  await symlink(nested, junction, 'junction');
  assert.notEqual(captureFile(path.join(junction, basename)).status, 0, 'junction scope must be rejected');
});

test('real NSIS compile captures the exact payload before a simulated Tauri source restore', { skip: process.platform !== 'win32' }, async (t) => {
  try { await access(compiler); } catch { t.skip('Requires the NSIS tool installed by a Tauri Windows bundle build.'); return; }
  const owner = await ownedFixture(t);
  const source = path.join(owner, basename);
  const bytes = fixtureBytes();
  await writeFile(source, bytes);
  const installer = path.join(owner, 'owned-extraction-only.exe');
  const extracted = path.join(owner, 'extracted');
  const script = path.join(owner, 'fixture.nsi');
  await writeFile(script, `
Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "${nsis(hook)}"
!define PRODUCTNAME "NSIS capture fixture only"
!define MAINBINARYNAME "natux-world-launcher-native"
!define MAINBINARYSRCPATH "${nsis(source)}"
Name "Owned payload extraction fixture"
OutFile "${nsis(installer)}"
InstallDir "${nsis(extracted)}"
RequestExecutionLevel user
SilentInstall silent
; Compile-time capture runs, but this production runtime function is NEVER
; called. No legacy registry, migration, uninstaller or startup code executes.
Function NeverRunProductionMigration
  !insertmacro NSIS_HOOK_PREINSTALL
FunctionEnd
Section
  SetOutPath "$INSTDIR"
  File "\${MAINBINARYSRCPATH}"
SectionEnd
`);
  const compiled = execute(compiler, ['/V2', script]);
  assert.equal(compiled.status, 0, compiled.output);
  assert.deepEqual(await readFile(`${source}.nsis-payload.exe`), bytes);
  await writeFile(source, fixtureBytes('UNK'));
  assert.notEqual(sha512(await readFile(source)), sha512(bytes));
  const extraction = execute(installer, ['/S']);
  assert.equal(extraction.status, 0, extraction.output);
  assert.deepEqual(await readFile(path.join(extracted, basename)), bytes);
  assert.deepEqual(await readFile(`${source}.nsis-payload.exe`), bytes);
});
