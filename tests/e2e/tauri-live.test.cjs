const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const liveEnabled = process.env.NATUX_TAURI_LIVE_ACCEPTANCE === '1';
const INSTALL_TIMEOUT = 30 * 60_000;
const CONNECTION_TIMEOUT = 5 * 60_000;

function readLiveConfig(env, currentOsUsername = os.userInfo().username) {
  assert.equal(env.NATUX_TAURI_LIVE_ACCEPTANCE, '1',
    'Set NATUX_TAURI_LIVE_ACCEPTANCE=1 to explicitly start Tauri live acceptance.');
  assert.equal(env.NATUX_TAURI_E2E_DEDICATED_ACCOUNT, 'YES',
    'Confirm NATUX_TAURI_E2E_DEDICATED_ACCOUNT=YES only for a dedicated test account.');
  assert.equal(env.NATUX_TAURI_E2E_ISOLATED_SERVER, 'YES',
    'Confirm NATUX_TAURI_E2E_ISOLATED_SERVER=YES only for a separate test server.');
  const configuredOsUsername = env.NATUX_TAURI_E2E_WINDOWS_ACCOUNT;
  assert.ok(typeof configuredOsUsername === 'string' && /test/i.test(configuredOsUsername),
    'Run under a dedicated Windows account with "test" in its name to isolate Credential Manager.');
  assert.equal(configuredOsUsername.toLocaleLowerCase('en-US'), currentOsUsername.toLocaleLowerCase('en-US'),
    'NATUX_TAURI_E2E_WINDOWS_ACCOUNT must match the current Windows account.');

  const required = [
    'NATUX_E2E_LOGIN', 'NATUX_E2E_PASSWORD', 'NATUX_E2E_USERNAME',
    'NATUX_TAURI_E2E_SERVER_ROOT', 'NATUX_E2E_SERVER_LOG',
  ];
  const missing = required.filter((key) => typeof env[key] !== 'string' || env[key].trim() === '');
  assert.deepEqual(missing, [], `Missing Tauri live acceptance prerequisites: ${missing.join(', ')}`);

  const username = env.NATUX_E2E_USERNAME;
  assert.match(username, /^[A-Za-z0-9_]{3,16}$/, 'Expected Minecraft username must be explicit');
  const serverAddress = env.NATUX_TAURI_E2E_SERVER_ADDRESS;
  assert.ok(typeof serverAddress === 'string', 'Set NATUX_TAURI_E2E_SERVER_ADDRESS to the isolated test server host:port.');
  assertIsolatedServerAddress(serverAddress);
  const serverRoot = path.resolve(env.NATUX_TAURI_E2E_SERVER_ROOT);
  assert.ok(/test/i.test(path.basename(serverRoot)),
    'NATUX_TAURI_E2E_SERVER_ROOT must name a dedicated test-server directory.');
  const serverLogPath = path.resolve(env.NATUX_E2E_SERVER_LOG);
  const logRelativeToServer = path.relative(serverRoot, serverLogPath);
  assert.ok(logRelativeToServer && logRelativeToServer !== '..'
    && !logRelativeToServer.startsWith(`..${path.sep}`) && !path.isAbsolute(logRelativeToServer),
  'NATUX_E2E_SERVER_LOG must be inside NATUX_TAURI_E2E_SERVER_ROOT.');

  return {
    login: env.NATUX_E2E_LOGIN,
    password: env.NATUX_E2E_PASSWORD,
    username,
    serverAddress,
    serverRoot,
    serverLogPath,
  };
}

function assertIsolatedServerAddress(address) {
  const match = /^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):([1-9]\d{0,4})$/.exec(address);
  assert.ok(match, 'Test server address must be host:port without a scheme or path.');
  const port = Number(match[2]);
  assert.ok(port <= 65535, 'Test server port must be between 1 and 65535.');
  const host = match[1].startsWith('[') ? match[1].slice(1, -1).toLowerCase() : match[1].toLowerCase();
  const ipv4 = host.split('.').map(Number);
  const validIpv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const privateIpv4 = validIpv4 && (ipv4[0] === 10 || ipv4[0] === 127
    || (ipv4[0] === 192 && ipv4[1] === 168)
    || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31));
  const privateHost = host === 'localhost' || privateIpv4 || host === '::1';
  const testHostname = !net.isIP(host) && host.split('.').some((label) => label.includes('test'));
  assert.ok(privateHost || testHostname,
    'Test server must use loopback/private IP or a hostname containing "test" in a DNS label.');
}

function hostPart(address) {
  if (address.startsWith('[')) return address.slice(1, address.indexOf(']')).toLowerCase();
  const portSeparator = address.lastIndexOf(':');
  return (portSeparator === -1 ? address : address.slice(0, portSeparator)).toLowerCase();
}

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

async function until(check, timeoutMs, message, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(message);
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    await runFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 10_000,
    });
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      throw new Error('Tauri and its child process tree did not stop.');
    }
  }
}

test('Tauri live preflight requires explicit test-only account and server attestations', () => {
  assert.throws(() => readLiveConfig({}), /NATUX_TAURI_LIVE_ACCEPTANCE=1/);
  assert.throws(() => readLiveConfig({ NATUX_TAURI_LIVE_ACCEPTANCE: '1' }), /DEDICATED_ACCOUNT=YES/);
});

test('Tauri live preflight rejects a production-style server log path', () => {
  const env = {
    NATUX_TAURI_LIVE_ACCEPTANCE: '1',
    NATUX_TAURI_E2E_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_E2E_ISOLATED_SERVER: 'YES',
    NATUX_TAURI_E2E_WINDOWS_ACCOUNT: 'natux-test-runner',
    NATUX_TAURI_E2E_SERVER_ADDRESS: '127.0.0.1:25565',
    NATUX_E2E_LOGIN: 'fixture-login',
    NATUX_E2E_PASSWORD: 'fixture-password',
    NATUX_E2E_USERNAME: 'FixtureUser',
    NATUX_TAURI_E2E_SERVER_ROOT: path.join(os.tmpdir(), 'minecraft-server'),
    NATUX_E2E_SERVER_LOG: path.join(os.tmpdir(), 'minecraft-server', 'logs', 'latest.log'),
  };
  assert.throws(() => readLiveConfig(env, 'natux-test-runner'), /test-server directory/);
  env.NATUX_TAURI_E2E_SERVER_ROOT = path.join(os.tmpdir(), 'natux-test-server');
  assert.throws(() => readLiveConfig(env, 'natux-test-runner'), /must be inside/);
  env.NATUX_E2E_SERVER_LOG = path.join(os.tmpdir(), 'natux-test-server', 'logs', 'latest.log');
  assert.equal(readLiveConfig(env, 'natux-test-runner').username, 'FixtureUser');
});

test('Tauri live preflight rejects the configured production server address', () => {
  assert.throws(() => assertIsolatedServerAddress('mc.vibestudy.ru:25565'), /loopback\/private IP/);
  assert.doesNotThrow(() => assertIsolatedServerAddress('mc-test.natuxworld.ru:25565'));
  assert.doesNotThrow(() => assertIsolatedServerAddress('192.168.4.10:25565'));
});

test('Tauri live preflight rejects the ordinary Windows account', () => {
  const env = {
    NATUX_TAURI_LIVE_ACCEPTANCE: '1',
    NATUX_TAURI_E2E_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_E2E_ISOLATED_SERVER: 'YES',
    NATUX_TAURI_E2E_WINDOWS_ACCOUNT: 'natux-test-runner',
  };
  assert.throws(() => readLiveConfig(env, 'natux-player'), /must match the current Windows account/);
});

test('Tauri live login → clean Forge install → PLAY → new server-confirmed join', {
  skip: liveEnabled ? false : 'Set NATUX_TAURI_LIVE_ACCEPTANCE=1 only after provisioning isolated test resources.',
  timeout: INSTALL_TIMEOUT + CONNECTION_TIMEOUT + 120_000,
}, async (t) => {
  assert.equal(process.platform, 'win32', 'Automated Tauri live acceptance currently requires Windows/WebView2.');
  const config = readLiveConfig(process.env);
  const executable = process.env.NATUX_TAURI_E2E_EXECUTABLE
    ? path.resolve(process.env.NATUX_TAURI_E2E_EXECUTABLE)
    : path.join(root, 'src', 'native', 'target', 'release', 'natux-world-launcher-native.exe');
  const repository = await fs.realpath(root);
  const packagedExecutable = await fs.realpath(executable);
  const relativeExecutable = path.relative(repository, packagedExecutable);
  assert.ok(relativeExecutable && !relativeExecutable.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeExecutable),
    'Tauri live acceptance executable must be a build artifact inside this repository.');

  const serverLog = await fs.open(config.serverLogPath, 'r');
  const initialLogStat = await serverLog.stat();
  assert.ok(initialLogStat.isFile(), 'Test server log must be a readable regular file.');
  const [realServerRoot, realServerLog] = await Promise.all([
    fs.realpath(config.serverRoot),
    fs.realpath(config.serverLogPath),
  ]);
  const realLogRelative = path.relative(realServerRoot, realServerLog);
  assert.ok(realLogRelative && realLogRelative !== '..'
    && !realLogRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realLogRelative),
  'Resolved test server log must remain inside the dedicated test-server directory.');

  const tempParent = await fs.realpath(os.tmpdir());
  const profileRoot = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-live-'));
  const appData = path.join(profileRoot, 'appdata');
  const localAppData = path.join(profileRoot, 'local-appdata');
  await fs.mkdir(appData);
  await fs.mkdir(localAppData);
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const userData = path.join(appData, packageJson.name);
  const debugPort = await unusedPort();
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_E2E_')
      || key.startsWith('NATUX_TAURI_LIVE_')
      || ['VITE_DEV_SERVER_URL', 'NODE_OPTIONS', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key)) {
      delete childEnv[key];
    }
  }
  childEnv.APPDATA = appData;
  childEnv.LOCALAPPDATA = localAppData;
  childEnv.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${debugPort}`;

  let child;
  let browser;
  let page;
  let spawnError;
  t.after(async () => {
    let profileCanBeRemoved = true;
    let processError;
    try {
      if (page && !page.isClosed()) {
        try {
          await page.evaluate(() => window.natux?.account?.logout());
        } catch {
          // Continue cleanup if the WebView already exited during a failed acceptance.
        }
      }
      await stopProcessTree(child);
    } catch (error) {
      profileCanBeRemoved = false;
      processError = error;
    }
    try {
      if (browser) await browser.close();
    } finally {
      await serverLog.close();
      if (profileCanBeRemoved) {
        const resolvedProfile = await fs.realpath(profileRoot);
        assert.equal(path.dirname(resolvedProfile), tempParent);
        assert.ok(path.basename(resolvedProfile).startsWith('natux-tauri-live-'));
        await fs.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      }
    }
    if (processError) throw processError;
  });

  child = spawn(packagedExecutable, [], { cwd: repository, env: childEnv, windowsHide: true, stdio: 'ignore' });
  child.on('error', (error) => { spawnError = error; });
  const endpoint = `http://127.0.0.1:${debugPort}`;
  await until(async () => {
    if (spawnError) throw new Error(`Tauri app failed to start (${spawnError.code}).`);
    assert.equal(child.exitCode, null, 'Tauri app exited before WebView initialization.');
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
      return response.ok;
    } catch { return false; }
  }, 30_000, 'Tauri WebView2 did not expose its test-only CDP endpoint.');

  browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  page = await until(
    () => browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.isClosed()),
    10_000,
    'Tauri renderer page missing.',
  );
  await page.waitForFunction(() => document.title === 'NATUX WORLD'
    && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
    && typeof window.natux?.account?.bootstrap === 'function');
  const productionServerAddress = await page.evaluate(async () => (await window.natux.server.getInfo()).ip);
  assert.notEqual(hostPart(config.serverAddress), hostPart(productionServerAddress).toLowerCase(),
    'Live acceptance must not launch against the production game server.');
  await page.evaluate((serverAddress) => {
    const api = window.natux;
    const originalPlay = api.launcher.play.bind(api.launcher);
    api.launcher.play = (options) => {
      window.__natuxE2eServerAddress = serverAddress;
      return originalPlay({ ...options, server: serverAddress });
    };
  }, config.serverAddress);

  try {
    await page.getByPlaceholder(/^(Ник или email|Username or email)$/).fill(config.login);
    await page.getByPlaceholder(/^(Пароль|Password)$/).fill(config.password);
    await page.getByRole('button', { name: /^(ВОЙТИ|LOG IN)$/ }).click();
  } catch {
    throw new Error('Could not submit live login through the packaged Tauri UI.');
  }
  await until(async () => {
    const result = await page.evaluate(() => window.natux.account.bootstrap());
    if (result.status !== 'authed') return false;
    assert.equal(result.user.username, config.username,
      'Authenticated account must match the explicitly configured dedicated test username.');
    return true;
  }, 60_000, 'Live login failed; use the dedicated test account without 2FA.');

  const settings = await page.evaluate(() => window.natux.settings.get());
  if (!settings.onboardingCompleted) {
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('heading', { name: 'Настроим игру', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await until(async () => (await page.evaluate(() => window.natux.settings.get())).onboardingCompleted,
      10_000, 'Onboarding settings were not persisted.');
  }
  await page.evaluate(() => {
    window.__natuxE2eStages = [];
    window.natux.launcher.onProgress((progress) => window.__natuxE2eStages.push(progress.stage));
  });

  let offset = initialLogStat.size;
  let text = '';
  const decoder = new StringDecoder('utf8');
  let discardPartialLine = false;
  if (offset) {
    const last = Buffer.alloc(1);
    await serverLog.read(last, 0, 1, offset - 1);
    discardPartialLine = last[0] !== 10;
  }
  const escaped = config.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const joined = new RegExp(`(?:^|\\s)${escaped} joined the game\\s*$`, 'm');
  await page.getByRole('button', { name: /^(ИГРАТЬ|PLAY)$/ }).click();
  assert.equal(await page.evaluate(() => window.__natuxE2eServerAddress), config.serverAddress,
    'PLAY must send the isolated test server address to the native launcher.');
  await until(async () => {
    const status = await page.evaluate(() => window.natux.launcher.getStatus());
    assert.notEqual(status.stage, 'error', 'Tauri install or launch failed; inspect local launcher logs.');
    return status.stage === 'running';
  }, INSTALL_TIMEOUT, 'Minecraft did not reach running state.', 1000);

  const stages = await page.evaluate(() => window.__natuxE2eStages);
  for (const stage of ['libraries', 'assets', 'natives-extract', 'forge-install', 'running']) {
    assert.ok(stages.includes(stage), `Fresh Tauri installation must emit ${stage}.`);
  }
  await fs.access(path.join(userData, 'minecraft', 'versions', '1.21.1', '1.21.1.jar'));

  await until(async () => {
    assert.equal((await page.evaluate(() => window.natux.launcher.getStatus())).stage, 'running',
      'Minecraft exited before the test server confirmed connection.');
    const current = await fs.stat(config.serverLogPath);
    assert.equal(current.dev, initialLogStat.dev, 'Test server log device changed during acceptance.');
    assert.equal(current.ino, initialLogStat.ino, 'Test server log rotated during acceptance.');
    assert.ok(current.size >= offset, 'Test server log was truncated during acceptance.');
    while (offset < current.size) {
      const buffer = Buffer.alloc(Math.min(current.size - offset, 64 * 1024));
      const { bytesRead } = await serverLog.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      offset += bytesRead;
      text += decoder.write(buffer.subarray(0, bytesRead));
      if (discardPartialLine) {
        const newline = text.indexOf('\n');
        if (newline === -1) { text = ''; continue; }
        text = text.slice(newline + 1);
        discardPartialLine = false;
      }
      const lastNewline = text.lastIndexOf('\n');
      if (lastNewline !== -1) {
        if (joined.test(text.slice(0, lastNewline + 1))) return true;
        text = text.slice(lastNewline + 1);
      }
      assert.ok(text.length < 1024 * 1024, 'Test server log contains an unexpectedly long line.');
    }
    return false;
  }, CONNECTION_TIMEOUT, 'No new test-server join for the dedicated account after PLAY.', 1000);
});
