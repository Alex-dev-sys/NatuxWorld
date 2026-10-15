const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');
const { assertNoExistingInstallation, selectCurrentInstaller } = require('./tauri-installed-helpers.cjs');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const enabled = process.env.NATUX_TAURI_UPGRADE_ACCEPTANCE === '1';

function readUpgradeConfig(env, username = os.userInfo().username) {
  assert.equal(env.NATUX_TAURI_UPGRADE_ACCEPTANCE, '1', 'Set NATUX_TAURI_UPGRADE_ACCEPTANCE=1 for a real signed updater acceptance.');
  assert.equal(env.NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT, 'YES', 'Use a dedicated Windows test account for installer registry and shortcuts.');
  assert.ok(/test/i.test(env.NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT ?? ''), 'Dedicated Windows account must contain test.');
  assert.equal(env.NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT.toLowerCase(), username.toLowerCase(), 'Configured Windows account must match the current account.');
  const keys = ['PREVIOUS_INSTALLER', 'PREVIOUS_VERSION', 'TARGET_INSTALLER', 'TARGET_HASH_FILE'];
  for (const key of keys) assert.ok(env[`NATUX_TAURI_UPGRADE_${key}`]?.trim(), `Set NATUX_TAURI_UPGRADE_${key}.`);
  assert.match(env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const channel = env.NATUX_TAURI_UPGRADE_CHANNEL || 'beta';
  assert.ok(channel === 'stable' || channel === 'beta', 'Upgrade channel must be stable or beta.');
  return { previousInstaller: env.NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER,
    previousVersion: env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION,
    targetInstaller: env.NATUX_TAURI_UPGRADE_TARGET_INSTALLER,
    targetHashFile: env.NATUX_TAURI_UPGRADE_TARGET_HASH_FILE, channel };
}

function isWithin(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function artifact(filename, repository) {
  const real = await fs.realpath(path.resolve(filename));
  assert.ok(isWithin(repository, real), 'Acceptance inputs must be repository release artifacts.');
  assert.ok((await fs.stat(real)).isFile(), 'Acceptance input must be a regular file.');
  return real;
}

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

async function connect(endpoint, version) {
  return waitFor(async () => {
    let browser;
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: 1500 });
      const page = browser.contexts().flatMap((context) => context.pages())[0];
      if (page && await page.evaluate(() => window.__TAURI_INTERNALS__?.invoke('get_version')) === version) {
        return { browser, page };
      }
    } catch { /* The old WebView may be closing while the new app starts. */ }
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
  const previous = await artifact(config.previousInstaller, repository);
  const target = await artifact(config.targetInstaller, repository);
  assert.match(path.basename(previous), /-setup\.exe$/i);
  assert.match(path.basename(target), /-setup\.exe$/i);
  assert.notEqual(previous, target);
  for (const installer of [previous, target]) {
    const signature = await artifact(`${installer}.sig`, repository);
    await runFile('cargo', ['run', '--manifest-path', 'src/native/Cargo.toml', '--locked', '--bin',
      'verify-updater-signature', '--', installer, signature], { cwd: repository, windowsHide: true, timeout: 120_000 });
  }
  const hashFile = await artifact(config.targetHashFile, repository);
  assert.ok((await fs.stat(hashFile)).size <= 132);
  const expectedHash = (await fs.readFile(hashFile, 'utf8')).trim();
  assert.match(expectedHash, /^[0-9a-f]{128}$/);
  const tempParent = await fs.realpath(os.tmpdir());
  const testRoot = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-upgrade-test-'));
  const installDirectory = path.join(testRoot, 'app');
  const appData = path.join(testRoot, 'appdata');
  const localAppData = path.join(testRoot, 'local-appdata');
  await fs.mkdir(appData);
  await fs.mkdir(localAppData);
  const userData = path.join(appData, packageJson.name);
  const port = await unusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_') ||
      ['NODE_OPTIONS', 'VITE_DEV_SERVER_URL', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key)) delete env[key];
  }
  let executable;
  let browser;
  let installed = false;
  t.after(async () => {
    await browser?.close().catch(() => {});
    if (executable) await stopInstalledProcesses(executable, testRoot);
    const uninstaller = path.join(installDirectory, 'uninstall.exe');
    if (installed) await runFile(uninstaller, ['/S'], { env, windowsHide: true, timeout: 60_000 });
    const resolved = await fs.realpath(testRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.ok(path.basename(resolved).startsWith('natux-tauri-upgrade-test-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });
  installed = true;
  await runFile(previous, ['/S', `/D=${installDirectory}`], { env, windowsHide: true, timeout: 120_000 });
  executable = await fs.realpath(path.join(installDirectory, 'natux-world-launcher-native.exe'));
  assert.ok(isWithin(testRoot, executable));
  const child = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
  child.on('error', (error) => { t.diagnostic(`Previous launcher failed: ${error.code}`); });
  let connected = await connect(endpoint, config.previousVersion);
  browser = connected.browser;
  await connected.page.evaluate((channel) => window.__TAURI_INTERNALS__.invoke('settings_set', {
    settings: { autoUpdate: false, telemetryEnabled: false, crashReports: false, updateChannel: channel },
  }), config.channel);
  const beforeSettings = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
  const preserved = new Map();
  for (const relative of ['minecraft/mods/acceptance-marker.jar', 'minecraft/config/acceptance-marker.txt', 'minecraft/saves/TestWorld/level.dat']) {
    const filename = path.join(userData, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const contents = Buffer.from(`isolated previous version: ${relative}`);
    await fs.writeFile(filename, contents);
    preserved.set(filename, contents);
  }
  const update = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('updater_check'));
  assert.equal(update.error, undefined, 'Signed release feed, rollout and download must succeed for this dedicated pilot.');
  assert.equal(update.available, true);
  assert.equal(update.version, packageJson.version);
  // The published channel and bundled update key are used unchanged. There is
  // no injected fake feed or success: install invokes the real native updater.
  await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('updater_install')).catch((error) => {
    if (!/closed|destroyed|disconnected|Target/i.test(error.message)) throw error;
  });
  await browser.close().catch(() => {});
  browser = undefined;
  connected = await connect(endpoint, packageJson.version);
  browser = connected.browser;
  const afterSettings = await connected.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
  assert.deepEqual(afterSettings, beforeSettings, 'Update/restart must preserve settings, consents and installId.');
  assert.equal(createHash('sha512').update(await fs.readFile(executable)).digest('hex'), expectedHash,
    'Restarted installed executable must match the target release, not the installer hash.');
  for (const [filename, bytes] of preserved) assert.deepEqual(await fs.readFile(filename), bytes);
});
