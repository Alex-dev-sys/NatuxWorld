const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '../..');

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

async function assertCorruptBackup(directory, filename, expectedBytes) {
  const prefix = `${filename}.corrupt-`;
  const backups = (await fs.readdir(directory))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'));
  assert.equal(backups.length, 1, `expected one recovery backup for ${filename}`);
  assert.deepEqual(await fs.readFile(path.join(directory, backups[0])), expectedBytes);
}

test('packaged Tauri app reads and preserves an isolated legacy Electron profile', { timeout: 60_000 }, async (t) => {
  if (process.platform !== 'win32') {
    t.skip('The current Tauri artifact and WebView2 smoke harness target Windows.');
    return;
  }

  const executable = process.env.NATUX_TAURI_E2E_EXECUTABLE
    ? path.resolve(process.env.NATUX_TAURI_E2E_EXECUTABLE)
    : path.join(root, 'src', 'native', 'target', 'release', 'natux-world-launcher-native.exe');
  await fs.access(executable).catch(() => {
    throw new Error('Tauri executable missing. Run npm run tauri:build first.');
  });

  const tempParent = await fs.realpath(os.tmpdir());
  const profileRoot = process.env.NATUX_TAURI_E2E_PROFILE_ROOT
    ? path.resolve(process.env.NATUX_TAURI_E2E_PROFILE_ROOT)
    : null;
  const ownsTempDir = profileRoot === null;
  const tempDir = profileRoot ?? await fs.mkdtemp(path.join(tempParent, 'natux-tauri-e2e-'));
  if (profileRoot) {
    const resolvedProfileRoot = await fs.realpath(profileRoot);
    assert.ok(resolvedProfileRoot !== tempParent && resolvedProfileRoot.startsWith(`${tempParent}${path.sep}`),
      'external profile root must be contained by the system temp directory');
    assert.ok(path.basename(resolvedProfileRoot).startsWith('natux-tauri-installed-'),
      'external profile root must be created by the installed-package test');
  }
  const appData = path.join(tempDir, 'appdata');
  const localAppData = path.join(tempDir, 'local-appdata');
  await fs.mkdir(appData);
  await fs.mkdir(localAppData);
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const userData = path.join(appData, packageJson.name);
  const minecraftDir = path.join(userData, 'minecraft');
  const legacySettings = {
    memory: 8192,
    fullscreen: false,
    closeOnLaunch: true,
    language: 'en',
    javaPath: 'C:\\Legacy Java\\bin\\javaw.exe',
    jvmArgs: '-XX:+UseSerialGC',
    resolution: { width: 1920, height: 1080 },
    javaMode: 'custom',
    autoUpdate: false,
    autoLaunch: false,
    crashReports: false,
    onboardingCompleted: true,
    minimizeToTray: false,
    launchOnStartup: false,
    updateChannel: 'stable',
    telemetryEnabled: false,
    installId: randomUUID(),
  };
  const legacySession = { start: 1_700_000_000_000, end: 1_700_003_600_000 };
  const legacyPlaytime = {
    totalMs: 3_600_000,
    sessions: [legacySession],
    activeStart: null,
    activeHeartbeat: null,
  };
  const legacyOfflineProfile = {
    uuid: 'b50ad385-829d-3141-a216-7e7d7539ba7f',
    username: 'Notch',
    accessToken: '0',
    type: 'offline',
  };
  const legacyAccountFile = JSON.stringify({
    token: 'Y2lwaGVydGV4dC1maXh0dXJl',
    user: { id: 'legacy-fixture', username: 'LegacyUser', email: 'legacy@example.test' },
    enc: true,
    savedAt: 1_700_000_000_000,
  }, null, 2);
  const worldMarker = Buffer.from('legacy-world-fixture-must-remain-untouched');
  const worldFile = path.join(minecraftDir, 'saves', 'LegacyWorld', 'level.dat');
  await fs.mkdir(path.dirname(worldFile), { recursive: true });
  await fs.writeFile(path.join(userData, 'settings.json'), JSON.stringify(legacySettings, null, 2));
  await fs.writeFile(path.join(userData, 'playtime.json'), JSON.stringify(legacyPlaytime, null, 2));
  await fs.writeFile(path.join(userData, 'account.json'), legacyAccountFile);
  await fs.writeFile(path.join(minecraftDir, 'auth.json'), JSON.stringify(legacyOfflineProfile, null, 2));
  await fs.writeFile(worldFile, worldMarker);
  const port = await unusedPort();
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_TAURI_E2E_')
      || ['VITE_DEV_SERVER_URL', 'NODE_OPTIONS', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key)) {
      delete env[key];
    }
  }
  env.APPDATA = appData;
  env.LOCALAPPDATA = localAppData;
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;

  let child;
  let browser;
  let spawnError;
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        await runFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 10_000,
        });
      } catch {
        if (child.exitCode === null && child.signalCode === null) throw new Error('Tauri process tree did not stop.');
      }
    }
    if (browser) await browser.close();

    if (ownsTempDir) {
      // Remove only this invocation's direct mkdtemp child, never a user profile or app artifact.
      const resolved = await fs.realpath(tempDir);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('natux-tauri-e2e-'));
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
  });

  child = spawn(executable, [], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  child.on('error', (error) => { spawnError = error; });
  const endpoint = `http://127.0.0.1:${port}`;
  let lastEndpointState = 'not reached';
  try {
    await waitFor(async () => {
      if (spawnError) throw new Error(`Tauri app failed to spawn (${spawnError.code})`);
      assert.equal(child.exitCode, null, 'Tauri app exited before WebView initialization');
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
        lastEndpointState = `HTTP ${response.status}`;
        return response.ok;
      } catch (error) {
        lastEndpointState = error.cause?.code ?? error.code ?? error.message;
        return false;
      }
    }, 30_000, 'Tauri WebView2 did not expose its test-only CDP endpoint');
  } catch (error) {
    let webViewProcesses = 'process list unavailable';
    try {
      const processes = await runFile('tasklist.exe', [
        '/FI', 'IMAGENAME eq msedgewebview2.exe', '/FO', 'CSV',
      ], { windowsHide: true, timeout: 5_000 });
      webViewProcesses = processes.stdout.trim();
    } catch { }
    throw new Error(`${error.message}; last CDP response: ${lastEndpointState}; WebView2 processes: ${webViewProcesses}`);
  }

  browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  const page = await waitFor(
    () => browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.isClosed()),
    10_000,
    'Tauri renderer page missing',
  );
  await page.waitForFunction(() => document.title === 'NATUX WORLD'
    && typeof window.__TAURI_INTERNALS__?.invoke === 'function');
  const rendererErrors = [];
  page.on('pageerror', (error) => rendererErrors.push(error.message));
  const loginField = page.getByPlaceholder('Username or email');
  const loginPassword = page.getByPlaceholder('Password', { exact: true });
  await loginField.waitFor({ state: 'visible' });
  await loginPassword.waitFor({ state: 'visible' });
  const loginButton = page.getByRole('button', { name: 'LOG IN' });
  assert.equal(await loginButton.isDisabled(), true, 'login remains disabled until credentials meet validation rules');
  await loginField.fill('TauriTest');
  await loginPassword.fill('TauriSmokePassword');
  assert.equal(await loginButton.isEnabled(), true, 'valid-looking login credentials enable submit');

  await page.getByRole('button', { name: 'No account? Sign up' }).click();
  await page.getByText('SIGN UP', { exact: true }).waitFor({ state: 'visible' });
  const usernameField = page.getByPlaceholder('Username (3-16, A-Z 0-9 _)');
  const emailField = page.getByPlaceholder('Email', { exact: true });
  const registerPassword = page.getByPlaceholder('Password (min. 8)');
  const confirmPassword = page.getByPlaceholder('Repeat password');
  await Promise.all([
    usernameField.waitFor({ state: 'visible' }),
    emailField.waitFor({ state: 'visible' }),
    registerPassword.waitFor({ state: 'visible' }),
    confirmPassword.waitFor({ state: 'visible' }),
  ]);
  const createButton = page.getByRole('button', { name: 'CREATE' });
  assert.equal(await createButton.isDisabled(), true, 'registration remains disabled until all fields validate');
  await usernameField.fill('Tauri_Test');
  await emailField.fill('tauri-e2e@example.test');
  await registerPassword.fill('TauriSmokePassword');
  await confirmPassword.fill('TauriSmokePassword');
  assert.equal(await createButton.isEnabled(), true, 'valid registration fields enable submit without sending a request');

  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await loginField.waitFor({ state: 'visible' });
  assert.equal(await loginField.inputValue(), '', 'returning to login starts with empty credentials');
  assert.deepEqual(rendererErrors, [], 'authentication navigation must not throw renderer errors');

  const native = await page.evaluate(async () => {
    const api = window.__TAURI_INTERNALS__;
    await api.invoke('launcher_cancel');
    return {
      version: await api.invoke('get_version'),
      settings: await api.invoke('settings_get'),
      playtime: await api.invoke('shell_playtime_get'),
      launcherStatus: await api.invoke('launcher_get_status'),
      offlineUser: await api.invoke('auth_get_user'),
      totpSetupInitial: await api.invoke('account_two_factor_setup', { request: {} }),
      totpSetupStepUp: await api.invoke('account_two_factor_setup', { request: { code: '654321' } }),
    };
  });
  assert.equal(native.version, packageJson.version);
  assert.equal(native.settings.memory, legacySettings.memory);
  assert.equal(native.settings.language, legacySettings.language);
  assert.equal(native.settings.javaPath, legacySettings.javaPath);
  assert.equal(native.settings.installId, legacySettings.installId);
  assert.equal(native.settings.onboardingCompleted, legacySettings.onboardingCompleted);
  assert.deepEqual(native.playtime, {
    totalMs: legacyPlaytime.totalMs,
    sessions: [legacySession],
    lastSession: legacySession,
    inGame: false,
  });
  assert.deepEqual(native.launcherStatus, {
    stage: 'idle',
    progress: 0,
    message: 'Готов к запуску',
  });
  assert.deepEqual(native.offlineUser, legacyOfflineProfile);
  assert.equal(native.totpSetupInitial.ok, false);
  assert.equal(native.totpSetupInitial.error.code, 'token_invalid');
  assert.equal(native.totpSetupStepUp.ok, false);
  assert.equal(native.totpSetupStepUp.error.code, 'token_invalid');

  const stored = JSON.parse(await fs.readFile(
    path.join(userData, 'settings.json'),
    'utf8',
  ));
  assert.deepEqual(stored, legacySettings);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(userData, 'playtime.json'), 'utf8')), legacyPlaytime);
  assert.equal(await fs.readFile(path.join(userData, 'account.json'), 'utf8'), legacyAccountFile);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(minecraftDir, 'auth.json'), 'utf8')), legacyOfflineProfile);
  assert.deepEqual(await fs.readFile(worldFile), worldMarker);

  const corruptedSettings = Buffer.from('{broken legacy settings');
  const corruptedPlaytime = Buffer.from('{broken legacy playtime');
  await fs.writeFile(path.join(userData, 'settings.json'), corruptedSettings);
  await fs.writeFile(path.join(userData, 'playtime.json'), corruptedPlaytime);
  const recovered = await page.evaluate(async () => {
    const api = window.__TAURI_INTERNALS__;
    return {
      settings: await api.invoke('settings_get'),
      playtime: await api.invoke('shell_playtime_get'),
    };
  });
  assert.equal(recovered.settings.memory, 4096);
  assert.notEqual(recovered.settings.installId, legacySettings.installId);
  assert.deepEqual(recovered.playtime, {
    totalMs: 0,
    sessions: [],
    lastSession: null,
    inGame: false,
  });
  await assertCorruptBackup(userData, 'settings.json', corruptedSettings);
  await assertCorruptBackup(userData, 'playtime.json', corruptedPlaytime);
});
