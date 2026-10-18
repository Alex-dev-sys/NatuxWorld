const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');
const { assertNoExistingInstallation, selectCurrentInstaller } = require('./tauri-installed-helpers.cjs');
const { captureUpgradeFailure, safeError } = require('./tauri-upgrade-diagnostics.cjs');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const enabled = process.env.NATUX_TAURI_UPGRADE_ACCEPTANCE === '1';

function readUpgradeConfig(env, username = os.userInfo().username) {
  assert.equal(env.NATUX_TAURI_UPGRADE_ACCEPTANCE, '1', 'Set NATUX_TAURI_UPGRADE_ACCEPTANCE=1 for a real signed updater acceptance.');
  assert.equal(env.NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT, 'YES', 'Use a dedicated Windows test account for installer registry and shortcuts.');
  assert.equal(env.NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT?.toLowerCase(), username.toLowerCase(), 'Configured Windows account must match the current account.');
  const ephemeral = env.NATUX_TAURI_UPGRADE_EPHEMERAL_CI;
  if (ephemeral) assert.equal(ephemeral, 'YES', 'Ephemeral CI must be explicitly acknowledged with YES.');
  if (ephemeral === 'YES') {
    const required = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
      GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_EVENT_NAME: 'workflow_dispatch' };
    for (const [key, value] of Object.entries(required)) assert.equal(env[key], value, `Hosted upgrade requires ${key}=${value}.`);
    assert.equal(username.toLowerCase(), 'runneradmin', 'Hosted upgrade requires the actual ephemeral runneradmin account.');
  } else {
    assert.ok(/test/i.test(username), 'Dedicated Windows account must contain test.');
  }
  const keys = ['PREVIOUS_INSTALLER', 'PREVIOUS_VERSION', 'TARGET_INSTALLER', 'TARGET_HASH_FILE'];
  for (const key of keys) assert.ok(env[`NATUX_TAURI_UPGRADE_${key}`]?.trim(), `Set NATUX_TAURI_UPGRADE_${key}.`);
  assert.match(env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const channel = env.NATUX_TAURI_UPGRADE_CHANNEL || 'beta';
  assert.ok(channel === 'stable' || channel === 'beta', 'Upgrade channel must be stable or beta.');
  const previousKind = env.NATUX_TAURI_UPGRADE_PREVIOUS_KIND || 'provided_artifact';
  assert.ok(['provided_artifact', 'published_previous', 'fresh_candidate'].includes(previousKind), 'Previous kind must distinguish a published release from a fresh candidate.');
  return { previousInstaller: env.NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER,
    previousVersion: env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION,
    targetInstaller: env.NATUX_TAURI_UPGRADE_TARGET_INSTALLER,
    targetHashFile: env.NATUX_TAURI_UPGRADE_TARGET_HASH_FILE, channel, previousKind, ephemeral: ephemeral === 'YES' };
}

function isWithin(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function artifact(filename, repository, maxBytes) {
  assert.ok(!filename.split(/[\\/]/).some(part => part === '..' || part === '.'), 'Artifact paths must not contain traversal.');
  const absolute = path.resolve(filename);
  assert.ok(isWithin(repository, absolute), 'Artifact input must stay inside this repository.');
  const stat = await fs.lstat(absolute);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Acceptance input must be a regular non-symlink file.');
  assert.ok(stat.size > 0 && stat.size <= maxBytes, 'Acceptance input must be nonempty and bounded.');
  const real = await fs.realpath(absolute);
  assert.ok(isWithin(repository, real), 'Acceptance inputs must be repository release artifacts.');
  assert.equal(real.toLowerCase(), absolute.toLowerCase(), 'Artifact input must not traverse junctions.');
  return real;
}

function assertInstallerName(filename, version) {
  const allowed = [`NATUX WORLD_${version}_x64-setup.exe`, `NatuxWorld-${version}-x64-setup.exe`];
  assert.ok(allowed.some(name => name.toLowerCase() === path.basename(filename).toLowerCase()),
    'Installer must be the exact requested versioned x64 NSIS artifact.');
}

function seedSettings(channel) {
  return { installId: randomUUID(), autoUpdate: false, autoLaunch: false, updateChannel: channel,
    telemetryEnabled: false, crashReports: false, onboardingCompleted: true, launchOnStartup: false, minimizeToTray: false };
}

function sha512(bytes) { return createHash('sha512').update(bytes).digest('hex'); }

async function waitFor(check, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function connect(endpoint, version, observations) {
  return waitFor(async () => {
    let browser;
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: 1500 });
      const page = browser.contexts().flatMap((context) => context.pages())[0];
      const actual = page && await page.evaluate(() => window.__TAURI_INTERNALS__?.invoke('get_version'));
      if (observations && typeof actual === 'string') observations.version = actual.slice(0, 80);
      if (actual === version) {
        return { browser, page };
      }
    } catch (error) { if (observations) observations.error = error; }
    await browser?.close().catch(() => {});
    return false;
  }, 180_000, `Installed launcher did not start version ${version}.`);
}

async function stopInstalledProcesses(executable, testRoot) {
  assert.ok(isWithin(testRoot, executable));
  const literal = executable.replaceAll("'", "''");
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${literal}' } | Select-Object -ExpandProperty ProcessId`],
  { windowsHide: true, timeout: 15_000 });
  for (const pid of stdout.trim().split(/\s+/).filter(Boolean)) {
    assert.match(pid, /^\d+$/);
    await runFile('taskkill.exe', ['/PID', pid, '/T', '/F'], { windowsHide: true, timeout: 15_000 });
  }
}

test('NSIS acceptance selects the current version while preserving historical artifacts', () => {
  const names = ['NATUX WORLD_1.9.15_x64-setup.exe', 'NATUX WORLD_1.10.0_x64-setup.exe',
    'NATUX WORLD_1.9.15_x64-setup.exe.sig', 'NATUX WORLD_1.10.0_arm64-setup.exe'];
  const original = [...names];
  assert.equal(selectCurrentInstaller(names, 'NATUX WORLD', '1.10.0'), 'NATUX WORLD_1.10.0_x64-setup.exe');
  assert.deepEqual(names, original);
  assert.throws(() => selectCurrentInstaller(names, 'NATUX WORLD', '1.10.1'), /current NSIS/);
  assert.throws(() => selectCurrentInstaller([...names, names[1]], 'NATUX WORLD', '1.10.0'), /current NSIS/);
  assert.equal(selectCurrentInstaller(['NATUX WORLD_1.10.0-beta.1_x64-setup.exe'], 'NATUX WORLD', '1.10.0-beta.1'),
    'NATUX WORLD_1.10.0-beta.1_x64-setup.exe');
});

test('installation preflight remains bounded, read-only and rejects existing or malformed results', async () => {
  let calls = 0;
  const probe = async (command, args, options) => {
    calls++;
    assert.equal(command, 'powershell.exe');
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 60_000);
    const script = args.at(-1);
    assert.match(script, /\$ErrorActionPreference = 'Stop'/);
    assert.match(script, /CurrentUser/);
    assert.match(script, /LocalMachine/);
    assert.match(script, /Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall/);
    assert.match(script, /GetValue\('DisplayName'/);
    assert.match(script, /OpenSubKey\([^\n]*\$false\)/);
    assert.doesNotMatch(script, /Get-ItemProperty|SilentlyContinue|SetValue|DeleteSubKey|CreateSubKey/);
    return { stdout: '0\r\n', stderr: '' };
  };
  await assertNoExistingInstallation('NATUX WORLD', probe);
  assert.equal(calls, 1);
  await assert.rejects(() => assertNoExistingInstallation('NATUX WORLD', async () => ({ stdout: '1\r\n', stderr: '' })),
    error => error.code === 'ERR_ASSERTION' && error.actual === 1 && error.expected === 0);
  for (const stdout of ['', '0 warning', '-1', '1\n0', '1e2', '9007199254740992']) {
    await assert.rejects(() => assertNoExistingInstallation('NATUX WORLD', async () => ({ stdout, stderr: '' })), /invalid registration count/);
  }
  await assert.rejects(() => assertNoExistingInstallation('NATUX WORLD', async () => ({ stdout: '0', stderr: 'Access denied' })), /registry read error/);
  for (const failure of [Object.assign(new Error('registry access denied'), { code: 'EACCES' }),
    Object.assign(new Error('probe timed out'), { killed: true, signal: 'SIGTERM' })]) {
    await assert.rejects(() => assertNoExistingInstallation('NATUX WORLD', async () => { throw failure; }), error => error === failure);
  }
  for (const product of ['', 'NATUX\nWORLD', null]) {
    await assert.rejects(() => assertNoExistingInstallation(product, probe), /product name/);
  }
  assert.equal(calls, 1, 'Malformed input must fail before starting the registry probe.');
});

test('upgrade acceptance requires an explicit dedicated Windows account and versioned artifacts', () => {
  assert.throws(() => readUpgradeConfig({}), /ACCEPTANCE=1/);
  const env = { NATUX_TAURI_UPGRADE_ACCEPTANCE: '1', NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT: 'upgrade-test', NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER: 'old-setup.exe',
    NATUX_TAURI_UPGRADE_PREVIOUS_VERSION: '1.9.14', NATUX_TAURI_UPGRADE_TARGET_INSTALLER: 'new-setup.exe',
    NATUX_TAURI_UPGRADE_TARGET_HASH_FILE: 'hash.txt' };
  assert.throws(() => readUpgradeConfig(env, 'ordinary-account'), /match the current/);
  assert.equal(readUpgradeConfig(env, 'upgrade-test').channel, 'beta');
  assert.throws(() => readUpgradeConfig({ ...env, NATUX_TAURI_UPGRADE_CHANNEL: 'preview' }, 'upgrade-test'), /channel/);
});

test('hosted upgrade requires every official ephemeral CI guard and never admits an ordinary local account', () => {
  const env = { NATUX_TAURI_UPGRADE_ACCEPTANCE: '1', NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_UPGRADE_EPHEMERAL_CI: 'YES', NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT: 'runneradmin',
    NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER: 'old-setup.exe', NATUX_TAURI_UPGRADE_PREVIOUS_VERSION: '1.10.0-rc.0',
    NATUX_TAURI_UPGRADE_TARGET_INSTALLER: 'new-setup.exe', NATUX_TAURI_UPGRADE_TARGET_HASH_FILE: 'hash.txt',
    CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
    GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_EVENT_NAME: 'workflow_dispatch' };
  assert.equal(readUpgradeConfig(env, 'runneradmin').ephemeral, true);
  const paths = ['NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER', 'NATUX_TAURI_UPGRADE_TARGET_INSTALLER', 'NATUX_TAURI_UPGRADE_TARGET_HASH_FILE'];
  for (const key of Object.keys(env)) {
    if (!paths.includes(key)) assert.throws(() => readUpgradeConfig({ ...env, [key]: 'wrong' }, 'runneradmin'), key);
    const missing = { ...env }; delete missing[key];
    assert.throws(() => readUpgradeConfig(missing, 'runneradmin'), `Missing ${key}`);
  }
  assert.throws(() => readUpgradeConfig(env, 'ordinary-account'), /match the current/);
  assert.throws(() => readUpgradeConfig({ ...env, NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT: 'ci-test' }, 'ci-test'), /actual ephemeral/);
  for (const kind of ['published_previous', 'fresh_candidate']) {
    assert.equal(readUpgradeConfig({ ...env, NATUX_TAURI_UPGRADE_PREVIOUS_KIND: kind }, 'runneradmin').previousKind, kind);
  }
  assert.throws(() => readUpgradeConfig({ ...env, NATUX_TAURI_UPGRADE_PREVIOUS_KIND: 'historical_without_proof' }, 'runneradmin'), /Previous kind/);
});

test('versioned installer names and isolated first-launch settings cannot substitute a shared profile', () => {
  assertInstallerName('NatuxWorld-1.10.0-x64-setup.exe', '1.10.0');
  assertInstallerName('NATUX WORLD_1.10.0-rc.0_x64-setup.exe', '1.10.0-rc.0');
  for (const name of ['NatuxWorld-1.9.15-x64-setup.exe', 'NatuxWorld-1.10.0-arm64-setup.exe', 'arbitrary-setup.exe']) {
    assert.throws(() => assertInstallerName(name, '1.10.0'));
  }
  const first = seedSettings('stable');
  assert.notEqual(first.installId, seedSettings('stable').installId);
  assert.match(first.installId, /^[0-9a-f-]{36}$/);
  for (const key of ['autoUpdate', 'autoLaunch', 'telemetryEnabled', 'crashReports', 'launchOnStartup']) assert.equal(first[key], false);
  assert.equal(first.updateChannel, 'stable');
});

test('artifact boundary rejects empty, oversized, redirected and traversing files without running installers', async (t) => {
  const runtime = path.join(root, 'tests', '.runtime');
  await fs.mkdir(runtime, { recursive: true });
  const parent = await fs.realpath(runtime);
  assert.equal(parent.toLowerCase(), runtime.toLowerCase());
  const owner = await fs.mkdtemp(path.join(parent, 'tauri-upgrade-unit-'));
  t.after(async () => {
    const actual = await fs.realpath(owner);
    assert.equal(path.dirname(actual), parent);
    assert.ok(path.basename(actual).startsWith('tauri-upgrade-unit-'));
    await fs.rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const file = path.join(owner, 'bounded.bin');
  await fs.writeFile(file, 'four');
  assert.equal(await artifact(file, owner, 4), await fs.realpath(file));
  await assert.rejects(() => artifact(file, owner, 3), /bounded/);
  await assert.rejects(() => artifact(file, path.join(owner, 'other'), 4), /inside this repository/);
  await assert.rejects(() => artifact(`${owner}${path.sep}unused${path.sep}..${path.sep}bounded.bin`, owner, 4), /traversal/);
  const empty = path.join(owner, 'empty.bin');
  await fs.writeFile(empty, '');
  await assert.rejects(() => artifact(empty, owner, 4), /nonempty/);
  const directory = path.join(owner, 'real');
  const redirected = path.join(owner, 'redirected');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'bounded.bin'), 'four');
  await fs.symlink(directory, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => artifact(path.join(redirected, 'bounded.bin'), owner, 4), /junctions/);
  assert.equal(await fs.readFile(path.join(directory, 'bounded.bin'), 'utf8'), 'four');
});

test('upgrade failure evidence observes only owned fixtures before cleanup and redacts errors', async (t) => {
  await fs.mkdir(path.join(root, 'tests/.runtime'), { recursive: true });
  const parent = await fs.realpath(path.join(root, 'tests/.runtime'));
  const owner = await fs.mkdtemp(path.join(parent, 'upgrade-diagnostics-unit-'));
  t.after(async () => {
    assert.equal(path.dirname(await fs.realpath(owner)), parent);
    assert.ok(path.basename(owner).startsWith('upgrade-diagnostics-unit-'));
    await fs.rm(owner, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const installDirectory = path.join(owner, 'app'); const runtimeDirectory = path.join(owner, 'evidence');
  await fs.mkdir(installDirectory); await fs.mkdir(runtimeDirectory);
  const executable = path.join(installDirectory, 'native.exe'); await fs.writeFile(executable, 'old fixture');
  const expectedHash = sha512(Buffer.from('new fixture'));
  const error = new Error('token=fixture-secret https://example.invalid/release?credential=fixture-url-secret');
  const execute = async (command, args) => {
    assert.equal(command, 'powershell.exe'); assert.ok(args.includes('-File'));
    assert.ok(args.includes(installDirectory)); assert.ok(args.includes(String(process.pid)));
    return { stdout: JSON.stringify({ testToken: { integritySid: 'S-1-16-8192', elevated: false },
      shell: { present: false }, ownedProcesses: [{ pid: 123, executable }], unqueryableCandidateCount: 0 }), stderr: '' };
  };
  const filename = await captureUpgradeFailure({ runtimeDirectory, testRoot: owner, installDirectory, executable,
    expectedHash, port: await unusedPort(), stage: 'await-target-restart', previousVersion: '1.10.0-rc.0',
    targetVersion: '1.10.0', observedVersion: '1.10.0-rc.0', error }, execute);
  const raw = await fs.readFile(filename, 'utf8'); const result = JSON.parse(raw);
  assert.equal(result.capturedBeforeCleanup, true); assert.equal(result.observedVersion, '1.10.0-rc.0');
  assert.equal(result.installedExecutable.sha512, sha512(Buffer.from('old fixture')));
  assert.equal(result.installedExecutable.matchesPublished, false); assert.equal(result.processContext.ownedProcesses[0].executable, executable);
  assert.doesNotMatch(raw, /fixture-secret|fixture-url-secret/); assert.ok(Buffer.byteLength(raw) < 64 * 1024);
  await assert.rejects(() => captureUpgradeFailure({ runtimeDirectory, testRoot: owner,
    installDirectory: path.dirname(owner), executable, expectedHash, port: 12345 }, execute), /owned/);
  assert.equal(await fs.readFile(executable, 'utf8'), 'old fixture');
});

test('real signed Tauri updater installs, restarts, and preserves an isolated previous-version profile', {
  skip: enabled ? false : 'Requires two signed versioned installers, a published signed feed, and a dedicated Windows test account.',
  timeout: 20 * 60_000,
}, async (t) => {
  assert.equal(process.platform, 'win32', 'Automated updater installation acceptance requires Windows.');
  const config = readUpgradeConfig(process.env);
  await assertNoExistingInstallation();
  const repository = await fs.realpath(root);
  const packageJson = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8'));
  assert.notEqual(config.previousVersion, packageJson.version, 'Two distinct versions are required; reinstall is not upgrade acceptance.');
  const previous = await artifact(config.previousInstaller, repository, 300 * 1024 * 1024);
  const target = await artifact(config.targetInstaller, repository, 300 * 1024 * 1024);
  if (config.ephemeral) {
    assertInstallerName(previous, config.previousVersion);
    assertInstallerName(target, packageJson.version);
  } else {
    assert.match(path.basename(previous), /-setup\.exe$/i);
    assert.match(path.basename(target), /-setup\.exe$/i);
  }
  assert.notEqual(previous, target);
  for (const installer of [previous, target]) {
    const signature = await artifact(`${installer}.sig`, repository, 4096);
    await runFile('cargo', ['run', '--manifest-path', 'src/native/Cargo.toml', '--locked', '--bin',
      'verify-updater-signature', '--', installer, signature], { cwd: repository, windowsHide: true, timeout: 120_000 });
  }
  const hashFile = await artifact(config.targetHashFile, repository, 132);
  const expectedHash = (await fs.readFile(hashFile, 'utf8')).trim();
  assert.match(expectedHash, /^[0-9a-f]{128}$/);
  const installerHashes = { previous: sha512(await fs.readFile(previous)), target: sha512(await fs.readFile(target)) };
  const runtimeDirectory = path.join(repository, 'tests', '.runtime');
  await fs.mkdir(runtimeDirectory, { recursive: true });
  assert.equal((await fs.realpath(runtimeDirectory)).toLowerCase(), runtimeDirectory.toLowerCase());
  const receiptFile = path.join(runtimeDirectory, 'tauri-upgrade-result.json');
  await fs.rm(receiptFile, { force: true });
  await fs.rm(path.join(runtimeDirectory, 'tauri-upgrade-failure.json'), { force: true });
  const tempParent = await fs.realpath(os.tmpdir());
  const testRoot = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-upgrade-test-'));
  const installDirectory = path.join(testRoot, 'app');
  const appData = path.join(testRoot, 'appdata');
  const localAppData = path.join(testRoot, 'local-appdata');
  await fs.mkdir(appData);
  await fs.mkdir(localAppData);
  const userData = path.join(appData, packageJson.name);
  await fs.mkdir(userData);
  const seeded = seedSettings(config.channel);
  await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify(seeded));
  const port = await unusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData };
  for (const key of Object.keys(env)) {
    const name = key.toUpperCase();
    if (name.startsWith('NATUX_') || name.startsWith('WEBVIEW2_') ||
      ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'VITE_DEV_SERVER_URL'].includes(name)) delete env[key];
  }
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
  let executable;
  let browser;
  let installed = false;
  let receipt;
  let failure;
  let child;
  let stage;
  const observations = {};
  const updaterEvents = [];
  const setStage = value => { stage = value; t.diagnostic(`Upgrade stage: ${value}`); };
  const recordFailure = async error => {
    t.diagnostic(`Upgrade failure at ${stage}: ${JSON.stringify(safeError(error))}`);
    try {
      const filename = await captureUpgradeFailure({ runtimeDirectory, testRoot, installDirectory,
        executable: executable ?? path.join(installDirectory, 'natux-world-launcher-native.exe'), expectedHash, port,
        stage, previousVersion: config.previousVersion, targetVersion: packageJson.version,
        observedVersion: observations.version, lastConnectError: observations.error, updaterEvents, child, error }, runFile);
      t.diagnostic(`Upgrade failure evidence: ${filename}`);
    } catch (diagnosticError) { t.diagnostic(`Could not capture upgrade failure: ${JSON.stringify(safeError(diagnosticError))}`); }
  };
  const preserved = new Map();
  // First launch already has a random credential namespace and disabled update
  // background work. No normal account or Credential Manager entry is a fixture.
  for (const relative of ['minecraft/mods/acceptance-marker.jar', 'minecraft/config/acceptance-marker.txt', 'minecraft/saves/TestWorld/level.dat']) {
    const filename = path.join(userData, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const contents = Buffer.from(`isolated previous version: ${relative}`);
    await fs.writeFile(filename, contents);
    preserved.set(filename, contents);
  }
  try {
    setStage('install-previous');
    installed = true;
    await runFile(previous, ['/S', `/D=${installDirectory}`], { env, windowsHide: true, timeout: 120_000 });
    executable = await artifact(path.join(installDirectory, 'natux-world-launcher-native.exe'), testRoot, 300 * 1024 * 1024);
    setStage('start-previous');
    child = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
    child.on('error', (error) => { t.diagnostic(`Previous launcher failed: ${error.code}`); });
    let connected = await connect(endpoint, config.previousVersion, observations);
    browser = connected.browser;
    await connected.page.exposeFunction('__recordUpgradeEvent', payload => {
      updaterEvents.push({ type: String(payload.type ?? '').slice(0, 40), version: String(payload.version ?? '').slice(0, 80),
        message: safeError({ message: payload.message }).message });
      if (updaterEvents.length > 32) updaterEvents.shift();
    });
    await connected.page.evaluate(async () => {
      const handler = window.__TAURI_INTERNALS__.transformCallback(event => { void window.__recordUpgradeEvent(event.payload); });
      await window.__TAURI_INTERNALS__.invoke('plugin:event|listen', { event: 'updater:event', target: { kind: 'Any' }, handler });
    });
    const beforeSettings = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
    for (const [key, value] of Object.entries(seeded)) assert.deepEqual(beforeSettings[key], value, `First launch must preserve seeded ${key}.`);
    setStage('check-and-download-public-update');
    const update = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('updater_check'));
    assert.equal(update.error, undefined, 'Signed release feed, rollout and download must succeed for this dedicated pilot.');
    assert.equal(update.available, true);
    assert.equal(update.version, packageJson.version);
    const expectedUrl = `https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v${packageJson.version}/NatuxWorld-${packageJson.version}-x64-setup.exe`;
    assert.equal(update.url, expectedUrl, 'Only the actual published target installer is accepted.');
    // Published feed, embedded key and native updater are unchanged. There is
    // no injected endpoint or mock success in this acceptance path.
    setStage('invoke-updater-install');
    const installReturned = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('updater_install')).then(() => true).catch((error) => {
      if (!/closed|destroyed|disconnected|Target/i.test(error.message)) throw error;
      return false;
    });
    // The pinned Windows plugin exits after ShellExecute succeeds. A normal
    // RPC return means the native command reported an early installation error.
    assert.equal(installReturned, false, `Windows updater must exit after starting its installer; native events: ${JSON.stringify(updaterEvents)}`);
    await browser.close().catch(() => {});
    browser = undefined;
    setStage('await-target-restart');
    observations.version = null;
    observations.error = null;
    connected = await connect(endpoint, packageJson.version, observations);
    browser = connected.browser;
    setStage('verify-target-profile-and-hash');
    const afterSettings = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
    assert.deepEqual(afterSettings, beforeSettings, 'Update/restart must preserve settings, consents and installId.');
    const installedHash = sha512(await fs.readFile(executable));
    assert.equal(installedHash, expectedHash, 'Restarted installed executable must match the published target release.');
    for (const [filename, bytes] of preserved) assert.deepEqual(await fs.readFile(filename), bytes);
    receipt = { success: true, previousVersion: config.previousVersion, targetVersion: packageJson.version,
      previousKind: config.previousKind,
      channel: config.channel, updaterUrl: update.url, installerSha512: installerHashes,
      expectedNativeSha512: expectedHash, installedNativeSha512: installedHash,
      settingsPreserved: true, installId: seeded.installId,
      fixtures: [...preserved].map(([filename, bytes]) => ({ path: path.relative(userData, filename), sha512: sha512(bytes) })) };
  } catch (error) {
    failure = error;
    await recordFailure(error);
  } finally {
    try {
      await browser?.close().catch(() => {});
      if (executable) await stopInstalledProcesses(executable, testRoot);
      if (installed) {
        const appExists = await fs.access(installDirectory).then(() => true, error => {
          if (error.code === 'ENOENT') return false;
          throw error;
        });
        if (appExists) {
          const uninstaller = await artifact(path.join(installDirectory, 'uninstall.exe'), testRoot, 100 * 1024 * 1024);
          await runFile(uninstaller, ['/S'], { env, windowsHide: true, timeout: 60_000 });
          await waitFor(async () => fs.access(installDirectory).then(() => false, error => {
            if (error.code === 'ENOENT') return true;
            throw error;
          }), 30_000, `Owned NSIS uninstall did not finish; preserving recovery files at ${testRoot}.`);
        }
        // Never recursively delete the app underneath a surviving registration.
        // Any cleanup error preserves the entire owner for recovery and fails CI.
        await waitFor(async () => {
          try { await assertNoExistingInstallation(); return true; } catch (error) {
            // NSIS can remove its directory before deleting the uninstall key.
            // Retry only the positive-registration count assertion; malformed
            // probe output, access failures and process errors must fail at once.
            if (error.code === 'ERR_ASSERTION' && error.expected === 0 && Number.isInteger(error.actual) && error.actual > 0) return false;
            throw error;
          }
        }, 30_000, `NATUX registration survived owned uninstall; preserving recovery files at ${testRoot}.`);
      }
      const resolved = await fs.realpath(testRoot);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('natux-tauri-upgrade-test-'));
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (cleanupError) {
      if (failure) t.diagnostic(`Cleanup also failed; preserving recovery files at ${testRoot}: ${cleanupError.stack ?? cleanupError}`);
      else { failure = cleanupError; setStage('cleanup'); await recordFailure(cleanupError); }
    }
  }
  if (failure) throw failure;
  await fs.writeFile(receiptFile, `${JSON.stringify({ ...receipt, uninstalled: true, ownerRemoved: true,
    completedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
});
