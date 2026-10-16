const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { assertNoExistingInstallation, isolatedInstallerEnvironment } = require('./tauri-installed-helpers.cjs');
const { VERSION, PREFIX, LEGACY_GUID, legacyUninstallerPath, readMigrationConfig, isWithin, assertCurrentInstallerName, ownedFile, embeddedPublicKey,
  verifyLegacyManifest, allowedDownload, downloadVerifiedLegacy, runFile, files, installedFile,
  registrations, assertOwnedRegistrations, waitFor, stopProcessList, stopExecutable, launch } = require('./tauri-electron-migration-helpers.cjs');

const repository = path.resolve(__dirname, '../..');
const enabled = process.env.NATUX_TAURI_ELECTRON_MIGRATION_ACCEPTANCE === '1';
const LEGACY_RUN = 'world.natux.launcher';
const NATIVE_RUN = 'NATUX WORLD';

function configuredEnvironment() {
  return { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
    GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', NATUX_TAURI_ELECTRON_MIGRATION_ACCEPTANCE: '1',
    NATUX_TAURI_ELECTRON_MIGRATION_DEDICATED_ACCOUNT: 'YES', NATUX_TAURI_ELECTRON_MIGRATION_EPHEMERAL_CI: 'YES',
    NATUX_TAURI_ELECTRON_MIGRATION_WINDOWS_ACCOUNT: 'runneradmin', NATUX_TAURI_E2E_INSTALLER: 'native-setup.exe',
    NATUX_TAURI_E2E_EXECUTABLE_HASH_FILE: 'native.sha512' };
}

test('real Electron migration excludes local machines, persistent runners, mismatched accounts and missing artifacts', () => {
  const env = configuredEnvironment();
  assert.equal(readMigrationConfig(env, 'runneradmin').installer, 'native-setup.exe');
  for (const name of ['CI', 'GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'RUNNER_OS', 'GITHUB_REPOSITORY',
    'NATUX_TAURI_ELECTRON_MIGRATION_ACCEPTANCE', 'NATUX_TAURI_ELECTRON_MIGRATION_DEDICATED_ACCOUNT',
    'NATUX_TAURI_ELECTRON_MIGRATION_EPHEMERAL_CI', 'NATUX_TAURI_E2E_INSTALLER', 'NATUX_TAURI_E2E_EXECUTABLE_HASH_FILE']) {
    assert.throws(() => readMigrationConfig({ ...env, [name]: '' }, 'runneradmin'), undefined, name);
  }
  assert.throws(() => readMigrationConfig(env, 'ordinary-user'), /match the current account/);
  assert.throws(() => readMigrationConfig({ ...env, RUNNER_ENVIRONMENT: 'self-hosted' }, 'runneradmin'), /Persistent/);
});

test('published 1.9.15 metadata verifies with the existing embedded Ed25519 trust key', async () => {
  const raw = '{"schemaVersion":1,"repository":"Alex-dev-sys/NatuxWorld","version":"1.9.15","artifact":"NATUX-WORLD-Setup-1.9.15-x64.exe","sha512":"0jfISZf2d4z23BHMLNCS1bDbf1xkDmBpf0jjdDPXlXBjy2sjte4fyyn33UpK8MtkRxpx0MDIoaroa4BKe3Usdw=="}';
  const signature = 'lecmeU7xyzK+pRVPvMKzsFrwin7ERgDll5+GM1dlKoGaGD+6DsDFdIxdG5eY64IYVWx9orgl1VkOaSV6hbsDCg==';
  const key = await embeddedPublicKey();
  assert.equal(verifyLegacyManifest(raw, signature, key).version, VERSION);
  assert.throws(() => verifyLegacyManifest(raw.replace('1.9.15', '1.9.16'), signature, key), /signature verification/);
  assert.throws(() => verifyLegacyManifest(raw, 'not-a-signature', key));
  assert.throws(() => verifyLegacyManifest('x'.repeat(16 * 1024 + 1), signature, key), /bounded/);
});

test('even valid signatures cannot select a different release, repository or executable', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const manifest = { schemaVersion: 1, repository: 'Alex-dev-sys/NatuxWorld', version: VERSION,
    artifact: `NATUX-WORLD-Setup-${VERSION}-x64.exe`, sha512: Buffer.alloc(64).toString('base64') };
  for (const patch of [{ repository: 'other/project' }, { version: '1.9.16' }, { artifact: '../other.exe' }, { sha512: 'invalid' }]) {
    const raw = JSON.stringify({ ...manifest, ...patch });
    const signature = sign(null, Buffer.from(raw), privateKey).toString('base64');
    assert.throws(() => verifyLegacyManifest(raw, signature, publicKey));
  }
});

test('installer downloads and installation registrations cannot escape their trust or ownership boundaries', () => {
  for (const filename of ['NATUX WORLD_1.10.0_x64-setup.exe', 'NatuxWorld-1.10.0-x64-setup.exe']) {
    assertCurrentInstallerName(filename, '1.10.0');
  }
  assert.throws(() => assertCurrentInstallerName('NatuxWorld-1.9.15-x64-setup.exe', '1.10.0'));
  assert.throws(() => assertCurrentInstallerName('NATUX WORLD_1.10.0_arm64-setup.exe', '1.10.0'));
  assert.equal(allowedDownload('https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.15/setup.exe'), true);
  assert.equal(allowedDownload('https://release-assets.githubusercontent.com/asset'), true);
  for (const url of ['http://github.com/asset', 'https://github.com.attacker.test/asset', 'https://user:password@github.com/asset']) {
    assert.equal(allowedDownload(url), false);
  }
  const app = path.resolve('isolated/app');
  assert.equal(isWithin(app, path.join(app, 'native.exe')), true);
  assert.equal(isWithin(app, app), false);
  assert.equal(isWithin(app, path.join(app, '..', 'other', 'native.exe')), false);
  assert.throws(() => assertOwnedRegistrations([{ version: '1.10.0', location: path.resolve('other/app') }], app, '1.10.0'));
  assert.throws(() => assertOwnedRegistrations([{ version: VERSION, location: app }, { version: '1.10.0', location: app }], app, '1.10.0'));
});

test('published legacy GUID may omit InstallLocation but only its exact owned quoted uninstaller is accepted', () => {
  const directory = 'C:\\Temp\\owned-fixture\\app';
  const entry = { key: `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${LEGACY_GUID}`,
    version: VERSION, uninstall: `"${directory}\\Uninstall NATUX WORLD.exe" /currentuser` };
  assertOwnedRegistrations([entry], directory, VERSION);
  assert.equal(legacyUninstallerPath(entry), `${directory}\\Uninstall NATUX WORLD.exe`);
  assert.throws(() => assertOwnedRegistrations([{ ...entry, version: '1.10.0' }], directory, '1.10.0'), /must provide InstallLocation/);
  for (const patch of [{ key: 'other-key' }, { uninstall: `${directory}\\Uninstall NATUX WORLD.exe` },
    { uninstall: `"${directory}\\Uninstall NATUX WORLD.exe" /allusers` },
    { uninstall: `"${directory}\\other.exe" /currentuser` },
    { uninstall: `"C:\\Temp\\elsewhere\\Uninstall NATUX WORLD.exe" /currentuser` },
    { uninstall: `"C:\\Temp\\owned-fixture\\..\\app\\Uninstall NATUX WORLD.exe" /currentuser` }]) {
    assert.throws(() => assertOwnedRegistrations([{ ...entry, ...patch }], directory, VERSION));
  }
});

test('quoted NSIS InstallLocation remains an absolute owned path and cannot hide another directory or arguments', () => {
  const directory = 'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\owned fixture\\app';
  const registration = location => [{ version: '1.10.0', location }];
  for (const location of [directory, `"${directory}"`, `"${directory.toUpperCase()}\\"`]) {
    assertOwnedRegistrations(registration(location), directory, '1.10.0');
  }
  for (const location of [`"${directory}`, `${directory}"`, `"${directory}" /S`,
    `"${directory}-other"`, `"${directory}\\..\\other"`, `"${directory}"\0`, '""',
    'C:relative\\app', 'relative/app', '\\\\server\\share\\app']) {
    assert.throws(() => assertOwnedRegistrations(registration(location), directory, '1.10.0'), undefined, location);
  }
});

test('stopping the old process tree tolerates already-removed descendants and surfaces a still-running kill failure', async () => {
  let pids = ['100', '101'];
  const killed = [];
  await stopProcessList(async () => pids, async (pid) => { killed.push(pid); pids = []; });
  assert.deepEqual(killed, ['100']);
  await assert.rejects(() => stopProcessList(async () => ['100'], async () => { throw new Error('process still running'); }), /still running/);
});

async function runEntries() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    $value = Get-Item -LiteralPath $key -ErrorAction SilentlyContinue
    $entries = @{}
    if ($value) { $value.GetValueNames() | ForEach-Object { $entries[$_] = [string]$value.GetValue($_, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } }
    ConvertTo-Json -InputObject $entries -Compress
  `], { windowsHide: true, timeout: 15_000 });
  return JSON.parse(stdout.trim());
}

async function writeOwnedLegacyRun(executable, owner) {
  await ownedFile(executable, owner);
  const command = `"${executable}" --hidden`;
  const literal = command.replaceAll("'", "''");
  await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    New-Item -Path $key -Force | Out-Null
    if (Get-ItemProperty -LiteralPath $key -Name '${LEGACY_RUN}' -ErrorAction SilentlyContinue) { throw 'Legacy Run entry already exists' }
    New-ItemProperty -LiteralPath $key -Name '${LEGACY_RUN}' -Value '${literal}' -PropertyType String | Out-Null
  `], { windowsHide: true, timeout: 15_000 });
  return command;
}

async function shortcuts() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $shell = New-Object -ComObject WScript.Shell
    $roots = @('Desktop', 'CommonDesktopDirectory', 'StartMenu', 'CommonStartMenu') | ForEach-Object { [Environment]::GetFolderPath($_) }
    $links = @($roots | Where-Object { $_ } | Select-Object -Unique | ForEach-Object {
      Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.BaseName.IndexOf('NATUX WORLD', [StringComparison]::OrdinalIgnoreCase) -ge 0) {
          [pscustomobject]@{ path=$_.FullName; target=$shell.CreateShortcut($_.FullName).TargetPath }
        }
      }
    })
    ConvertTo-Json -InputObject $links -Compress
  `], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.trim());
}

async function seedProfile(profile) {
  const settings = { memory: 8192, fullscreen: true, closeOnLaunch: false, language: 'en', javaPath: '',
    jvmArgs: '-XX:+UseSerialGC', resolution: { width: 1600, height: 900 }, javaMode: 'bundled', autoUpdate: false,
    autoLaunch: false, crashReports: false, onboardingCompleted: true, minimizeToTray: false,
    launchOnStartup: true, updateChannel: 'stable', telemetryEnabled: false, installId: randomUUID() };
  const fixtures = new Map([
    ['settings.json', Buffer.from(JSON.stringify(settings, null, 2))],
    ['playtime.json', Buffer.from(JSON.stringify({ totalMs: 3600000, sessions: [{ start: 1700000000000, end: 1700003600000 }], activeStart: null, activeHeartbeat: null }))],
    ['minecraft/saves/MigrationFixture/level.dat', Buffer.from('synthetic-world-never-use-player-data')],
    ['minecraft/mods/migration-fixture.jar', Buffer.from('synthetic-mod-marker')],
    ['minecraft/config/migration-fixture.txt', Buffer.from('synthetic-game-configuration')],
  ]);
  for (const [relative, bytes] of fixtures) {
    const filename = path.join(profile, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, bytes);
  }
  return { settings, fixtures };
}

async function assertFixtures(profile, fixtures) {
  for (const [relative, expected] of fixtures) assert.deepEqual(await fs.readFile(path.join(profile, relative)), expected, `Migration altered ${relative}.`);
}

test('published installed Electron 1.9.15 migrates in place to installed Tauri without losing the opened profile', {
  skip: enabled ? false : 'Requires explicitly enabled clean ephemeral Windows CI and current NSIS/hash artifacts.',
  timeout: 12 * 60_000,
}, async (t) => {
  assert.equal(process.platform, 'win32');
  const config = readMigrationConfig(process.env);
  await assertNoExistingInstallation();
  const originalRun = await runEntries();
  assert.equal(originalRun[LEGACY_RUN], undefined, 'The test must not replace an existing startup entry.');
  assert.equal(originalRun[NATIVE_RUN], undefined);
  assert.deepEqual(await shortcuts(), [], 'An existing launcher shortcut excludes this test account.');
  const repo = await fs.realpath(repository);
  const target = await ownedFile(path.resolve(config.installer), repo);
  const hashFile = await ownedFile(path.resolve(config.hashFile), repo);
  const pkg = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
  assertCurrentInstallerName(target, pkg.version);
  assert.ok((await fs.stat(hashFile)).size <= 132);
  const expectedHash = (await fs.readFile(hashFile, 'utf8')).trim();
  assert.match(expectedHash, /^[0-9a-f]{128}$/);
  const temporary = await fs.realpath(os.tmpdir());
  const owner = await fs.mkdtemp(path.join(temporary, PREFIX));
  const installDirectory = path.join(owner, 'app');
  const appData = path.join(owner, 'appdata');
  const localAppData = path.join(owner, 'local-appdata');
  const downloads = path.join(owner, 'downloads');
  const recovery = path.join(owner, 'recovery');
  for (const directory of [appData, localAppData, downloads, recovery]) await fs.mkdir(directory);
  const profile = path.join(appData, 'natux-world-launcher');
  const env = isolatedInstallerEnvironment(appData, localAppData);
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_') || ['ELECTRON_RUN_AS_NODE', 'ELECTRON_DISABLE_SANDBOX'].includes(key)) delete env[key];
  }
  let oldExecutable = path.join(installDirectory, 'NATUX WORLD.exe');
  let nativeExecutable = path.join(installDirectory, 'natux-world-launcher-native.exe');
  let oldUninstaller;
  let installedOldUninstaller;
  let browser;
  let installed = false;
  let success = false;
  let primaryFailure;
  let cleanupFailure;
  let preservedFixtures;
  try {
    const legacy = await downloadVerifiedLegacy(downloads);
    assert.equal(createHash('sha512').update(await fs.readFile(legacy.installer)).digest('base64'), legacy.manifest.sha512,
      'Verify the downloaded file on disk immediately before execution.');
    t.diagnostic(`Verified published v${VERSION} Ed25519 manifest and installer SHA-512 before executing.`);
    installed = true;
    await runFile(legacy.installer, ['/S', '/currentuser', `/D=${installDirectory}`], { env, windowsHide: true, timeout: 120_000 });
    oldExecutable = await installedFile(installDirectory, /^NATUX WORLD\.exe$/i);
    const legacyFiles = await files(installDirectory);
    assert.ok(legacyFiles.some((filename) => /(?:^|[\\/])app\.asar$/i.test(filename)), 'The source installation must really contain Electron.');
    const oldRegistration = await registrations();
    assertOwnedRegistrations(oldRegistration, installDirectory, VERSION);
    assert.ok(oldRegistration[0].key.toLowerCase().endsWith(`\\${LEGACY_GUID}`), 'Exercise the published Electron uninstall GUID.');
    installedOldUninstaller = await installedFile(installDirectory, /^Uninstall NATUX WORLD\.exe$/i);
    assert.equal(await ownedFile(legacyUninstallerPath(oldRegistration[0]), installDirectory), installedOldUninstaller,
      'The legacy registry command must resolve to the exact installed owned uninstaller.');
    oldUninstaller = path.join(recovery, 'electron-uninstaller.exe');
    await fs.copyFile(installedOldUninstaller, oldUninstaller);
    assert.deepEqual(await fs.readFile(oldUninstaller), await fs.readFile(installedOldUninstaller));
    if (legacy.manifest.executableSha512) assert.equal(createHash('sha512').update(await fs.readFile(oldExecutable)).digest('base64'), legacy.manifest.executableSha512);
    else t.diagnostic('Published 1.9.15 manifest has no executableSha512; its signed installer hash remains mandatory.');
    const { settings, fixtures } = await seedProfile(profile);
    preservedFixtures = fixtures;
    const openedOld = await launch(oldExecutable, env, profile, 'electron', VERSION, owner);
    browser = openedOld.browser;
    assert.deepEqual(await openedOld.page.evaluate(() => window.natux.settings.get()), settings,
      'The published old binary must open the exact synthetic profile through --user-data-dir.');
    await browser.close();
    browser = undefined;
    await stopExecutable(oldExecutable, owner);
    await assertFixtures(profile, fixtures);
    await writeOwnedLegacyRun(oldExecutable, owner);

    // No manual old uninstall: the native installer must perform the actual
    // cross-engine takeover, retire the old GUID/payload, and preserve profile.
    await runFile(target, ['/S', `/D=${installDirectory}`], { env, windowsHide: true, timeout: 180_000 });
    const migrated = await registrations();
    assertOwnedRegistrations(migrated, installDirectory, pkg.version);
    assert.ok(!migrated.some((entry) => entry.key.toLowerCase().endsWith(`\\${LEGACY_GUID}`)));
    const afterRun = await runEntries();
    assert.equal(afterRun[LEGACY_RUN], undefined, 'The old engine must no longer run at login.');
    nativeExecutable = await installedFile(installDirectory, /^natux-world-launcher-native\.exe$/i);
    assert.equal(afterRun[NATIVE_RUN], `"${nativeExecutable}" --from-autostart`);
    const migratedShortcuts = await shortcuts();
    assert.ok(migratedShortcuts.length > 0, 'Installed Tauri must have its normal launcher shortcut.');
    for (const link of migratedShortcuts) {
      assert.ok(isWithin(installDirectory, link.target), 'A migrated shortcut must point into this installation.');
      assert.match(path.basename(link.target), /^(?:natux-world-launcher-native|uninstall)\.exe$/i,
        'No shortcut may keep starting the retired Electron engine.');
    }
    const unrelated = { ...afterRun };
    delete unrelated[NATIVE_RUN];
    assert.deepEqual(unrelated, originalRun, 'Migration must preserve every unrelated startup entry.');
    const payload = await files(installDirectory);
    assert.deepEqual(payload.filter((filename) => /(?:^|[\\/])(?:NATUX WORLD\.exe|app\.asar|electron\.exe|node\.exe|chrome_elf\.dll|preload\.cjs)$/i.test(filename)), [],
      'The new installation must not retain Electron or a Node.js sidecar.');
    assert.equal(createHash('sha512').update(await fs.readFile(nativeExecutable)).digest('hex'), expectedHash,
      'Installed native executable must match its hash after signing and installer metadata patches.');
    await assertFixtures(profile, fixtures);
    await stopExecutable(nativeExecutable, owner);
    const openedNative = await launch(nativeExecutable, env, profile, 'tauri', pkg.version, owner);
    browser = openedNative.browser;
    const nativeSettings = await openedNative.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
    assert.equal(nativeSettings.startupSupported, true);
    delete nativeSettings.startupSupported;
    assert.deepEqual(nativeSettings, settings);
    assert.equal(await openedNative.page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await openedNative.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('shell_playtime_get').then((value) => value.totalMs)), 3600000);
    assert.equal(await openedNative.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('account_bootstrap').then((value) => value.status)), 'guest');
    await browser.close();
    browser = undefined;
    await stopExecutable(nativeExecutable, owner);
    await assertFixtures(profile, fixtures);
    success = true;
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (!success) t.diagnostic(`Migration acceptance failed; recovery files retained at ${owner}.`);
    try {
      await browser?.close().catch(() => {});
      for (const executable of [oldExecutable, nativeExecutable].filter(Boolean)) await stopExecutable(executable, owner);
      if (installed) {
        const nativeUninstaller = path.join(installDirectory, 'uninstall.exe');
        if (await fs.access(nativeUninstaller).then(() => true, () => false)) {
          await runFile(await ownedFile(nativeUninstaller, owner), ['/S'], { env, windowsHide: true, timeout: 60_000 });
        }
        const remaining = await registrations();
        if (remaining.some((entry) => entry.key.toLowerCase().endsWith(`\\${LEGACY_GUID}`))) {
          const recoveryUninstaller = await fs.access(oldUninstaller ?? '').then(() => oldUninstaller, () => installedOldUninstaller);
          assert.ok(recoveryUninstaller, `No known legacy recovery uninstaller; preserve ${owner}.`);
          assertOwnedRegistrations(remaining, installDirectory, VERSION);
          await runFile(await ownedFile(recoveryUninstaller, owner), ['/S', '/currentuser', `_?=${installDirectory}`], { env, windowsHide: true, timeout: 60_000 });
        }
        await waitFor(async () => (await registrations()).length === 0, 15_000, `Installer cleanup left registered applications; preserve ${owner}.`);
        await assertNoExistingInstallation();
        assert.deepEqual(await shortcuts(), [], 'Only the spawned uninstallers may remove their registry/shortcuts.');
        assert.deepEqual(await runEntries(), originalRun, 'Uninstallers must remove owned startup entries and preserve unrelated entries.');
        if (preservedFixtures) await assertFixtures(profile, preservedFixtures);
        await waitFor(async () => {
          try { await fs.access(installDirectory); return false; }
          catch (error) { if (error.code === 'ENOENT') return true; throw error; }
        }, 10_000, `Uninstallers left installed files behind; preserve ${owner}.`);
      }
      if (success) {
        const resolved = await fs.realpath(owner);
        assert.equal(path.dirname(resolved), temporary);
        assert.ok(path.basename(resolved).startsWith(PREFIX));
        await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      }
    } catch (cleanupError) {
      t.diagnostic(`Cleanup failed; recovery files retained at ${owner}.`);
      cleanupFailure = cleanupError;
    }
  }
  if (primaryFailure && cleanupFailure) throw new AggregateError([primaryFailure, cleanupFailure], `Migration and cleanup failed; preserve ${owner}.`);
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
});
