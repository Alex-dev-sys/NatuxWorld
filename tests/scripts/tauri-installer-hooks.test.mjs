import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = path.join(process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe');
const legacyGuid = 'a4b4c9af-4db5-52ba-94a5-1ac47f40eef5';
const runKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const entries = ['world.natux.launcher', 'electron.app.NATUX WORLD', 'electron.app.natux-world-launcher'];

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

function nsis(value) {
  return value.replaceAll('$', '$$').replaceAll('"', '$\\"');
}

function childOf(directory, filename) {
  const relative = path.relative(path.resolve(directory), path.resolve(filename));
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function replaceExact(source, before, after, expected) {
  assert.equal(source.split(before).length - 1, expected, `Production hook changed: ${before}`);
  return source.replaceAll(before, after);
}

function execute(executable, args = []) {
  try {
    return { status: 0, output: execFileSync(executable, args,
      { windowsHide: true, encoding: 'utf8', timeout: 45_000, stdio: 'pipe' }) };
  } catch (error) {
    if (typeof error.status !== 'number') throw error;
    return { status: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function registryKey(namespace, child) {
  assert.match(namespace, /^Software\\NatuxTauriInstallerHookTests\\[0-9a-f-]+$/);
  assert.ok(child === 'Legacy' || child === 'Run');
  return `HKCU\\${namespace}\\${child}`;
}

function regWrite(namespace, child, name, value) {
  const result = execute('reg.exe', ['add', registryKey(namespace, child), '/v', name, '/t', 'REG_SZ', '/d', value, '/f']);
  assert.equal(result.status, 0, result.output);
}

function regRead(namespace, child, name) {
  const result = execute('reg.exe', ['query', registryKey(namespace, child), '/v', name]);
  if (result.status === 1) return null;
  assert.equal(result.status, 0, result.output);
  const row = result.output.split(/\r?\n/).find(line => line.includes('REG_SZ'));
  assert.ok(row, result.output);
  return row.split(/\s+REG_SZ\s+/)[1] ?? '';
}

async function compile(filename, source) {
  await writeFile(filename, source);
  const result = execute(compiler, ['/V2', filename]);
  assert.equal(result.status, 0, result.output);
}

async function fixture(root, nonce, hook) {
  assert.ok(childOf(root, path.join(root, nonce)));
  const base = path.join(root, nonce);
  const old = path.join(base, 'Old Electron with spaces');
  const native = path.join(base, 'New Native with spaces');
  const namespace = `Software\\NatuxTauriInstallerHookTests\\${nonce}`;
  const startupEntries = entries.map((_, i) => `fixture-${nonce}-legacy-${i}`);
  const product = `fixture-${nonce}-native`;
  await mkdir(path.join(old, 'resources'), { recursive: true });
  await mkdir(path.join(base, 'profile', 'saves', 'fixture-world'), { recursive: true });
  await writeFile(path.join(old, 'NATUX WORLD.exe'), 'MZ owned fixture, never executable');
  await writeFile(path.join(old, 'resources', 'app.asar'), 'owned legacy runtime');
  await writeFile(path.join(base, 'profile', 'settings.json'), '{"fixture":"preserve"}');
  await writeFile(path.join(base, 'profile', 'saves', 'fixture-world', 'level.dat'), 'world sentinel');
  let isolated = replaceExact(hook, `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${legacyGuid}`, `${namespace}\\Legacy`, 1);
  isolated = replaceExact(isolated, runKey, `${namespace}\\Run`, 1);
  for (const [index, entry] of entries.entries()) {
    isolated = replaceExact(isolated, `"${entry}"`, `"${startupEntries[index]}"`, 2);
  }
  assert.ok(!isolated.includes(legacyGuid));
  assert.ok(!isolated.includes(runKey));
  await writeFile(path.join(base, 'isolated-hook.nsh'), isolated);
  const oldBuilder = path.join(base, 'create-old-uninstaller.exe');
  const receipt = path.join(base, 'uninstall-parameters.txt');
  await compile(path.join(base, 'legacy.nsi'), `
Unicode true
!include "FileFunc.nsh"
Name "${product}-old"
OutFile "${nsis(oldBuilder)}"
InstallDir "${nsis(old)}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
Section
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\\Uninstall NATUX WORLD.exe"
SectionEnd
Section "Uninstall"
  \${GetParameters} $0
  FileOpen $1 "${nsis(receipt)}" w
  FileWrite $1 "$0"
  FileClose $1
  Delete "${nsis(path.join(old, 'NATUX WORLD.exe'))}"
  Delete "${nsis(path.join(old, 'resources', 'app.asar'))}"
  DeleteRegKey HKCU "${namespace}\\Legacy"
SectionEnd
`);
  assert.equal(execute(oldBuilder, ['/S']).status, 0);
  const takeover = path.join(base, 'takeover.exe');
  await compile(path.join(base, 'takeover.nsi'), `
Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define PRODUCTNAME "${product}"
!define MAINBINARYNAME "fixture-native"
!include "${nsis(path.join(base, 'isolated-hook.nsh'))}"
Name "${product}"
OutFile "${nsis(takeover)}"
InstallDir "${nsis(native)}"
RequestExecutionLevel user
SilentInstall silent
Section
  !insertmacro NSIS_HOOK_PREINSTALL
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\\fixture-native.exe" w
  FileWrite $0 "MZ owned fixture, never executable"
  FileClose $0
  !insertmacro NSIS_HOOK_POSTINSTALL
SectionEnd
`);
  return { base, old, native, namespace, startupEntries, product, receipt, takeover };
}

async function preserved(f) {
  assert.equal(await readFile(path.join(f.base, 'profile', 'settings.json'), 'utf8'), '{"fixture":"preserve"}');
  assert.equal(await readFile(path.join(f.base, 'profile', 'saves', 'fixture-world', 'level.dat'), 'utf8'), 'world sentinel');
}

async function cleanup(root, f) {
  if (f) {
    assert.match(f.namespace, /^Software\\NatuxTauriInstallerHookTests\\[0-9a-f-]+$/);
    const result = execute('reg.exe', ['delete', `HKCU\\${f.namespace}`, '/f']);
    assert.ok(result.status === 0 || result.status === 1, result.output);
  }
  const parent = path.join(repository, 'src', 'native', 'target');
  assert.ok(childOf(parent, root), 'Cleanup must remain inside ignored native test output.');
  await rm(root, { recursive: true, force: true });
}

test('compiled NSIS takeover preserves profiles and rejects unsafe uninstall commands', {
  timeout: 240_000,
  skip: process.platform !== 'win32' ? 'NSIS hook runtime acceptance requires Windows.' : false,
}, async t => {
  if (!await exists(compiler)) return t.skip('Tauri NSIS compiler is unavailable; run this after the Windows Tauri build.');
  const hook = await readFile(path.join(repository, 'config', 'tauri-installer-hooks.nsh'), 'utf8');
  await mkdir(path.join(repository, 'src', 'native', 'target'), { recursive: true });
  for (const scenario of ['takeover', 'keep-native-startup', 'unquoted', 'incomplete', 'extra-arguments', 'drive-root']) {
    await t.test(scenario, async () => {
      const root = await mkdtemp(path.join(repository, 'src', 'native', 'target', 'installer-hook-test-'));
      let f;
      try {
        f = await fixture(root, randomUUID(), hook);
        regWrite(f.namespace, 'Legacy', 'Publisher', 'NATUX WORLD');
        regWrite(f.namespace, 'Legacy', 'DisplayName', 'NATUX WORLD 1.9.15');
        const oldUninstaller = path.join(f.old, 'Uninstall NATUX WORLD.exe');
        const valid = `"${oldUninstaller}" /currentuser`;
        const command = scenario === 'unquoted' ? oldUninstaller
          : scenario === 'incomplete' ? `"${oldUninstaller}`
            : scenario === 'extra-arguments' ? `${valid} --delete-app-data`
              : scenario === 'drive-root' ? `"${path.parse(f.old).root}Uninstall NATUX WORLD.exe"` : valid;
        regWrite(f.namespace, 'Legacy', 'UninstallString', command);
        const matchingStartup = `"${path.join(f.old, 'NATUX WORLD.exe')}" --hidden`;
        const unrelated = `"${path.join(f.base, 'Unrelated app.exe')}" --hidden`;
        regWrite(f.namespace, 'Run', f.startupEntries[0], matchingStartup);
        regWrite(f.namespace, 'Run', f.startupEntries[1], unrelated);
        if (scenario === 'keep-native-startup') regWrite(f.namespace, 'Run', f.product, unrelated);
        const result = execute(f.takeover, ['/S']);
        const success = scenario === 'takeover' || scenario === 'keep-native-startup';
        assert.equal(result.status, success ? 0 : 2, result.output);
        await preserved(f);
        assert.equal(regRead(f.namespace, 'Run', f.startupEntries[1]), unrelated);
        if (success) {
          assert.equal(regRead(f.namespace, 'Legacy', 'UninstallString'), null);
          assert.equal(await exists(path.join(f.old, 'NATUX WORLD.exe')), false);
          assert.equal(await exists(path.join(f.old, 'resources', 'app.asar')), false);
          assert.equal(await exists(oldUninstaller), false);
          assert.equal(regRead(f.namespace, 'Run', f.startupEntries[0]), null);
          const parameters = await readFile(f.receipt, 'utf8');
          assert.match(parameters, /\/currentuser/);
          assert.doesNotMatch(parameters, /--delete-app-data/);
          assert.equal(regRead(f.namespace, 'Run', f.product), scenario === 'keep-native-startup'
            ? unrelated : `"${path.join(f.native, 'fixture-native.exe')}" --from-autostart`);
        } else {
          assert.equal(await exists(f.receipt), false, 'Unsafe input must abort before invoking old uninstaller.');
          assert.equal(await exists(f.native), false, 'Unsafe input must abort before installing files.');
          assert.equal(await exists(oldUninstaller), true);
          assert.equal(await readFile(path.join(f.old, 'NATUX WORLD.exe'), 'utf8'), 'MZ owned fixture, never executable');
          assert.equal(await readFile(path.join(f.old, 'resources', 'app.asar'), 'utf8'), 'owned legacy runtime');
          assert.equal(regRead(f.namespace, 'Legacy', 'UninstallString'), command);
          assert.equal(regRead(f.namespace, 'Run', f.startupEntries[0]), matchingStartup);
          assert.equal(regRead(f.namespace, 'Run', f.product), null);
        }
      } finally { await cleanup(root, f); }
    });
  }
});
