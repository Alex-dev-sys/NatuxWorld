import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

async function readOnlyProbe(root, hook, statements) {
  const legacy = path.join(root, 'owned legacy directory');
  await mkdir(legacy);
  const include = path.join(root, 'read-only-hook.nsh');
  await writeFile(include, hook);
  const executable = path.join(root, 'read-only-probe.exe');
  const receipt = path.join(root, 'completed.txt');
  await compile(path.join(root, 'read-only-probe.nsi'), `
Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "${nsis(include)}"
Name "Natux read-only directory probe"
OutFile "${nsis(executable)}"
RequestExecutionLevel user
SilentInstall silent
Section
  Push "${nsis(legacy)}"
  Call NatuxCanonicalDirectory
  Pop $NatuxCanonicalLegacy
  ${statements}
  FileOpen $9 "${nsis(receipt)}" w
  FileWrite $9 "completed"
  FileClose $9
SectionEnd
`);
  // No NSIS_HOOK_PRE/POSTINSTALL, uninstaller, registry writes or production
  // directories are modified. Only the protected-directory preflight is called.
  return { result: execute(executable, ['/S']), receipt };
}

async function fixture(root, nonce, hook, scenario) {
  assert.ok(childOf(root, path.join(root, nonce)));
  const base = path.join(root, nonce);
  const home = path.join(base, 'user long');
  const roaming = path.join(home, 'AppData', 'Roaming');
  const local = path.join(home, 'AppData', 'Local');
  const documents = path.join(home, 'Documents');
  const profile = path.join(roaming, 'natux-world-launcher');
  const sharedRoots = {
    'windows-root': path.join(base, 'Windows'),
    'system-root': path.join(base, 'Windows', 'System32'),
    'programfiles32-root': path.join(base, 'Program Files (x86)'),
    'programfiles64-root': path.join(base, 'Program Files'),
    'commonfiles32-root': path.join(base, 'Program Files (x86)', 'Common Files'),
    'commonfiles64-root': path.join(base, 'Program Files', 'Common Files'),
    'programdata-root': path.join(base, 'ProgramData'),
  };
  const ordinary = path.join(base, 'Old Electron with spaces');
  const old = sharedRoots[scenario] ?? (scenario === 'profile-root' || scenario === 'case-trailing' || scenario === 'short-alias' ? profile
    : scenario === 'profile-child' ? path.join(profile, 'minecraft')
      : scenario === 'profile-ancestor' ? path.dirname(roaming)
      : scenario === 'roaming-root' ? roaming : scenario === 'local-root' ? local
        : scenario === 'home-root' ? home : scenario === 'documents-root' ? documents
          : scenario === 'programs-child' ? path.join(local, 'Programs', 'NATUX WORLD')
            : scenario === 'programfiles-child' ? path.join(sharedRoots['programfiles64-root'], 'NATUX WORLD')
              : scenario === 'programdata-child' ? path.join(sharedRoots['programdata-root'], 'NATUX WORLD')
                : scenario === 'prefix-sibling' ? `${profile}-other` : ordinary);
  const native = path.join(base, 'New Native with spaces');
  const namespace = `Software\\NatuxTauriInstallerHookTests\\${nonce}`;
  const startupEntries = entries.map((_, i) => `fixture-${nonce}-legacy-${i}`);
  const product = `fixture-${nonce}-native`;
  const optional = path.join(base, 'not-created protected folder');
  const protectedSentinels = Object.values(sharedRoots).map(directory => path.join(directory, 'preserve-system-data.txt'));
  for (const directory of [roaming, local, documents, ...Object.values(sharedRoots)]) await mkdir(directory, { recursive: true });
  for (const sentinel of protectedSentinels) await writeFile(sentinel, 'protected shared data');
  if (scenario === 'protected-file') await writeFile(optional, 'invalid protected directory');
  if (scenario === 'legacy-junction') {
    await mkdir(profile);
    await symlink(profile, old, 'junction');
  } else if (scenario === 'protected-junction') {
    const redirectedProfile = path.join(old, 'redirected-profile');
    await mkdir(redirectedProfile, { recursive: true });
    await symlink(redirectedProfile, profile, 'junction');
  }
  await mkdir(path.join(old, 'resources'), { recursive: true });
  await mkdir(path.join(profile, 'minecraft', 'saves', 'fixture-world'), { recursive: true });
  await writeFile(path.join(old, 'NATUX WORLD.exe'), 'MZ owned fixture, never executable');
  await writeFile(path.join(old, 'resources', 'app.asar'), 'owned legacy runtime');
  await writeFile(path.join(profile, 'settings.json'), '{"fixture":"preserve"}');
  await writeFile(path.join(profile, 'minecraft', 'saves', 'fixture-world', 'level.dat'), 'world sentinel');
  let isolated = replaceExact(hook, `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${legacyGuid}`, `${namespace}\\Legacy`, 1);
  isolated = replaceExact(isolated, runKey, `${namespace}\\Run`, 1);
  for (const [index, entry] of entries.entries()) {
    isolated = replaceExact(isolated, `"${entry}"`, `"${startupEntries[index]}"`, 2);
  }
  // Only the inputs are remapped. Production canonicalization and abort logic
  // run unchanged, without reading/writing any real user-data or registry roots.
  const protectedMacro = isolated.match(/!macro NATUX_CHECK_PROTECTED_DIRECTORIES\r?\n[\s\S]*?!macroend/g);
  assert.equal(protectedMacro?.length, 1);
  isolated = replaceExact(isolated, protectedMacro[0], `!macro NATUX_CHECK_PROTECTED_DIRECTORIES
  !insertmacro NATUX_PROTECT_PROFILE "${nsis(profile)}"
${[optional, roaming, local, home, documents, ...Object.values(sharedRoots)].map(directory => `  !insertmacro NATUX_PROTECT_DIRECTORY "${nsis(directory)}"`).join('\n')}
!macroend`, 1);
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
  ; Mirror the published Electron uninstaller's recursive install-root removal.
  RMDir /r "$INSTDIR"
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
  return { base, old, native, profile, namespace, startupEntries, product, receipt, takeover, protectedSentinels };
}

async function preserved(f) {
  assert.equal(await readFile(path.join(f.profile, 'settings.json'), 'utf8'), '{"fixture":"preserve"}');
  assert.equal(await readFile(path.join(f.profile, 'minecraft', 'saves', 'fixture-world', 'level.dat'), 'utf8'), 'world sentinel');
  for (const sentinel of f.protectedSentinels) assert.equal(await readFile(sentinel, 'utf8'), 'protected shared data');
}

function shortDirectory(directory) {
  const literal = directory.replaceAll("'", "''");
  const result = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices;
      public static class NatuxShortPath { [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
      public static extern uint GetShortPathName(string path, StringBuilder output, uint length); }'
    $output = New-Object System.Text.StringBuilder 32768
    $length = [NatuxShortPath]::GetShortPathName('${literal}', $output, 32768)
    if ($length -eq 0 -or $length -ge 32768) { throw 'Could not query fixture short path' }
    $output.ToString()
  `]);
  assert.equal(result.status, 0, result.output);
  return result.output.trim();
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

test('production hook guards canonical user-data directories before running an uninstaller', async () => {
  const hook = await readFile(path.join(repository, 'config', 'tauri-installer-hooks.nsh'), 'utf8');
  assert.match(hook, /GetFinalPathNameByHandleW/);
  assert.match(hook, /CreateFileW[\s\S]*?0x02000000/);
  assert.ok(hook.indexOf('!insertmacro NATUX_CHECK_PROTECTED_DIRECTORIES', hook.indexOf('!macro NSIS_HOOK_PREINSTALL')) < hook.indexOf('ExecWait'));
  assert.ok(hook.includes('NATUX_PROTECT_PROFILE "$APPDATA\\natux-world-launcher"'));
  for (const root of ['$APPDATA', '$LOCALAPPDATA', '$PROFILE', '$DOCUMENTS', '$DESKTOP',
    '$WINDIR', '$SYSDIR', '$PROGRAMFILES32', '$PROGRAMFILES64', '$COMMONFILES32', '$COMMONFILES64']) {
    assert.ok(hook.includes(`NATUX_PROTECT_DIRECTORY "${root}"`), root);
  }
  assert.match(hook, /Push "\{62AB5D82-FDC1-4DC3-A9DD-070D1D495D97\}"\r?\n {2}Call NatuxProtectKnownFolder/);
});

test('compiled real known-folder preflight is read-only and only skips missing optional folders', {
  timeout: 120_000,
  skip: process.platform !== 'win32' ? 'Windows known-folder APIs are required.' : false,
}, async t => {
  if (!await exists(compiler)) return t.skip('Tauri NSIS compiler is unavailable.');
  const hook = await readFile(path.join(repository, 'config', 'tauri-installer-hooks.nsh'), 'utf8');
  const parent = path.join(repository, 'src', 'native', 'target');
  await mkdir(parent, { recursive: true });
  const cases = [
    { name: 'unmodified production macro and actual Windows known-folder APIs', status: 0 },
    { name: 'optional FILE_NOT_FOUND without an allocated pointer', hresult: -2147024894, status: 0 },
    { name: 'optional PATH_NOT_FOUND without an allocated pointer', hresult: -2147024893, status: 0 },
    { name: 'optional FILE_NOT_FOUND frees an API-returned pointer', hresult: -2147024894, pointer: true, status: 0 },
    { name: 'optional Downloads FILE_NOT_FOUND is permitted', hresult: -2147024894, guid: '{374DE290-123F-4565-9164-39C4925E467B}', status: 0 },
    { name: 'required ProgramData FILE_NOT_FOUND aborts', hresult: -2147024894, guid: '{62AB5D82-FDC1-4DC3-A9DD-070D1D495D97}', status: 2 },
    { name: 'required ProgramData PATH_NOT_FOUND aborts', hresult: -2147024893, guid: '{62AB5D82-FDC1-4DC3-A9DD-070D1D495D97}', status: 2 },
    { name: 'required ProgramData failure frees an API-returned pointer', hresult: -2147024894, guid: '{62AB5D82-FDC1-4DC3-A9DD-070D1D495D97}', pointer: true, status: 2 },
    { name: 'ACCESS_DENIED still aborts', hresult: -2147024891, status: 2 },
    { name: 'other lookup errors still abort', hresult: -2147467259, status: 2 },
    { name: 'success with no path pointer still aborts', hresult: 0, status: 2 },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const root = await mkdtemp(path.join(parent, 'installer-hook-known-folder-'));
      try {
        const real = scenario.hresult === undefined;
        const code = real ? hook : replaceExact(hook,
          "  System::Call 'shell32::SHGetKnownFolderPath(g r0, i 0x4000, p 0, *p .r1) i.r2'",
          `${scenario.pointer ? "  System::Call 'ole32::CoTaskMemAlloc(i 16) p.r1'\n" : ''}  StrCpy $2 ${scenario.hresult}`, 1);
        const statement = real ? '!insertmacro NATUX_CHECK_PROTECTED_DIRECTORIES' : `
          StrCpy $1 12345
          Push "${scenario.guid ?? '{4C5C32FF-BB9D-43B0-BF7D-478D689A2CF6}'}"
          Call NatuxProtectKnownFolder
          \${If} $1 != 12345
            SetErrorLevel 3
            Abort "The known-folder helper corrupted its caller registers."
          \${EndIf}`;
        const { result, receipt } = await readOnlyProbe(root, code, statement);
        assert.equal(result.status, scenario.status, result.output);
        assert.equal(await exists(receipt), scenario.status === 0);
      } finally { await cleanup(root); }
    });
  }
});

test('compiled NSIS takeover preserves canonical profiles and rejects unsafe uninstall commands', {
  timeout: 240_000,
  skip: process.platform !== 'win32' ? 'NSIS hook runtime acceptance requires Windows.' : false,
}, async t => {
  if (!await exists(compiler)) return t.skip('Tauri NSIS compiler is unavailable; run this after the Windows Tauri build.');
  const hook = await readFile(path.join(repository, 'config', 'tauri-installer-hooks.nsh'), 'utf8');
  await mkdir(path.join(repository, 'src', 'native', 'target'), { recursive: true });
  for (const scenario of ['takeover', 'programs-child', 'programfiles-child', 'programdata-child', 'prefix-sibling', 'keep-native-startup',
    'unquoted', 'incomplete', 'extra-arguments', 'drive-root', 'profile-root', 'profile-child', 'profile-ancestor',
    'roaming-root', 'local-root', 'home-root', 'documents-root', 'case-trailing', 'short-alias',
    'windows-root', 'system-root', 'programfiles32-root', 'programfiles64-root', 'commonfiles32-root', 'commonfiles64-root', 'programdata-root',
    'legacy-junction', 'protected-junction', 'protected-file']) {
    await t.test(scenario, async subtest => {
      const root = await mkdtemp(path.join(repository, 'src', 'native', 'target', 'installer-hook-test-'));
      let f;
      try {
        f = await fixture(root, randomUUID(), hook, scenario);
        regWrite(f.namespace, 'Legacy', 'Publisher', 'NATUX WORLD');
        regWrite(f.namespace, 'Legacy', 'DisplayName', 'NATUX WORLD 1.9.15');
        const oldUninstaller = path.join(f.old, 'Uninstall NATUX WORLD.exe');
        let commandDirectory = f.old;
        if (scenario === 'case-trailing') commandDirectory = `${f.old.toUpperCase()}\\`;
        if (scenario === 'short-alias') {
          commandDirectory = shortDirectory(f.old);
          if (commandDirectory.toLowerCase() === f.old.toLowerCase()) return subtest.skip('The fixture volume does not expose a distinct 8.3 alias.');
        }
        const valid = `"${commandDirectory}\\Uninstall NATUX WORLD.exe" /currentuser`;
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
        const success = ['takeover', 'programs-child', 'programfiles-child', 'programdata-child', 'prefix-sibling', 'keep-native-startup'].includes(scenario);
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
