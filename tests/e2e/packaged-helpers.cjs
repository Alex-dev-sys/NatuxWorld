const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '../..');

async function until(check, timeout, message, interval = 250) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(interval);
  }
  throw new Error(message);
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  return port;
}

async function bounded(operation, timeout) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cleanup timed out')), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function packagedLockResources(executable) {
  const executableDir = path.dirname(executable);
  const candidates = [
    path.join(executableDir, 'resources'),
    path.resolve(executableDir, '..', 'Resources'),
  ];
  for (const resourceRoot of candidates) {
    const helperPath = path.join(resourceRoot, 'natux-lock',
      process.platform === 'win32' ? 'lock-helper.exe' : 'lock-helper');
    const agentJarPath = path.join(resourceRoot, 'natux-lock', 'natux-lock-agent.jar');
    try {
      await Promise.all([fs.access(helperPath), fs.access(agentJarPath)]);
      return { resourceRoot, helperPath, agentJarPath };
    } catch {
      // Try the macOS bundle resource directory after the executable sibling directory.
    }
  }
  throw new Error('Packaged lock-helper or Java lock-agent JAR is missing from resources/natux-lock.');
}

function startPackagedLockHelper(resources, kind, userData) {
  const child = spawn(resources.helperPath, ['--kind', kind, '--user-data', userData], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  let buffer = '';
  let settled = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const exited = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const finish = (error, line) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) rejectReady(error);
    else resolveReady(line);
  };
  const timer = setTimeout(() => finish(new Error(`Bundled ${kind} lock-helper did not answer`)), 5_000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    finish(undefined, buffer.slice(0, newline).replace(/\r$/, ''));
  });
  child.once('error', (error) => finish(error));
  child.once('close', (code) => {
    if (!settled) finish(new Error(`Bundled ${kind} lock-helper exited before handshake (${code ?? 'unknown'})`));
  });

  async function release() {
    if (child.exitCode === null && child.signalCode === null) child.stdin.end();
    try {
      await bounded(exited, 5_000);
    } catch {
      child.kill();
      await bounded(exited, 5_000);
    }
  }

  return { child, ready, release };
}

async function verifyPackagedLockResources(resources, userData) {
  const profileProbe = startPackagedLockHelper(resources, 'profile', userData);
  try {
    assert.equal(await profileProbe.ready, 'NATUX_LOCK_BUSY_V1',
      'running Electron must hold the cross-process profile lock');
  } finally {
    await profileProbe.release();
  }

  const gameLease = startPackagedLockHelper(resources, 'game', userData);
  let gameContender;
  try {
    assert.equal(await gameLease.ready, 'NATUX_LOCK_READY_V1', 'bundled helper must acquire a free game lock');
    gameContender = startPackagedLockHelper(resources, 'game', userData);
    assert.equal(await gameContender.ready, 'NATUX_LOCK_BUSY_V1', 'bundled helper must reject a held game lock');
  } finally {
    await gameLease.release();
    await gameContender?.release();
  }

  const reacquired = startPackagedLockHelper(resources, 'game', userData);
  try {
    assert.equal(await reacquired.ready, 'NATUX_LOCK_READY_V1', 'game lock must be released on helper exit');
  } finally {
    await reacquired.release();
  }
}

async function launchPackaged(t, options = {}) {
  const executable = process.env.NATUX_E2E_EXECUTABLE
    ? path.resolve(process.env.NATUX_E2E_EXECUTABLE)
    : path.join(root, 'release', 'win-unpacked', 'NATUX WORLD.exe');
  assert.ok(process.platform === 'win32' || process.env.NATUX_E2E_EXECUTABLE,
    'Set NATUX_E2E_EXECUTABLE to the packaged executable on this platform');
  await fs.access(executable).catch(() => {
    throw new Error('Packaged executable missing. Build it first or set NATUX_E2E_EXECUTABLE.');
  });
  const lockResources = await packagedLockResources(executable);
  const tempParent = await fs.realpath(os.tmpdir());
  const ownsProfile = !options.userData;
  let tempDir;
  let userData;
  if (ownsProfile) {
    tempDir = await fs.mkdtemp(path.join(tempParent, 'natux-packaged-e2e-'));
    userData = path.join(tempDir, 'user-data');
    await fs.mkdir(userData);
  } else {
    const ownerRoot = await fs.realpath(options.profileOwnerRoot);
    userData = await fs.realpath(options.userData);
    assert.ok(ownerRoot !== tempParent && ownerRoot.startsWith(`${tempParent}${path.sep}`),
      'external profile owner must be inside the system temp directory');
    assert.ok(path.basename(ownerRoot).startsWith('natux-tauri-installed-'),
      'external profile owner must be created by the installed Tauri test');
    assert.ok(path.relative(ownerRoot, userData).startsWith(`appdata${path.sep}`),
      'external profile must be inside the Tauri test APPDATA directory');
  }
  let child;
  let browser;
  let page;
  let spawnError;

  t.after(async () => {
    const errors = [];
    if (ownsProfile && page && !page.isClosed()) {
      for (const action of [
        () => page.evaluate(() => window.natux.launcher.cancel()),
        () => page.evaluate(() => window.natux.account.logout()),
      ]) {
        try { await bounded(action(), 15_000); } catch { errors.push('IPC cleanup failed'); }
      }
    }
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') {
        await new Promise((resolve) => {
          execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (err) => {
            if (err && child.exitCode === null && child.signalCode === null) errors.push('Process tree cleanup failed');
            resolve();
          });
        });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (err) {
          if (err.code !== 'ESRCH') errors.push('Process group cleanup failed');
        }
      }
      try {
        await until(() => child.exitCode !== null || child.signalCode !== null, 10_000, 'App did not exit');
      } catch { errors.push('App did not exit'); }
    }
    if (browser) {
      try { await bounded(browser.close(), 5_000); } catch { errors.push('CDP disconnect failed'); }
    }
    if (ownsProfile) {
      // Delete only this invocation's direct mkdtemp child, never an executable or existing profile.
      const resolved = await fs.realpath(tempDir);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('natux-packaged-e2e-'));
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
    assert.deepEqual(errors, [], 'Packaged application cleanup must succeed');
  });

  const port = await unusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || ['VITE_DEV_SERVER_URL', 'ELECTRON_RUN_AS_NODE',
      'NODE_OPTIONS', 'ELECTRON_DISABLE_SANDBOX'].includes(key)) delete env[key];
  }
  // Electron 43 maps this switch to the same DIR_USER_DATA used by app.getPath('userData').
  // Keep the signed executable, preload, CSP and production fuses untouched.
  child = spawn(executable, [
    `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
  ], { cwd: root, env, windowsHide: true, detached: process.platform !== 'win32', stdio: 'ignore' });
  child.on('error', (err) => { spawnError = err; });
  await until(async () => {
    if (spawnError) throw new Error(`Packaged app failed to spawn (${spawnError.code})`);
    assert.equal(child.exitCode, null, 'Packaged app exited before renderer initialization');
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
      return response.ok;
    } catch { return false; }
  }, 30_000, 'Packaged app did not expose its renderer CDP endpoint');
  browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  assert.ok(processInfo.some((item) => item.type === 'browser' && Number(item.id) === child.pid),
    'CDP must belong to the executable spawned by this test');
  await cdp.detach();
  page = await until(() => browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('app://launcher/')), 15_000, 'Packaged app:// renderer missing');
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => typeof window.natux?.getVersion === 'function');
  const settings = await page.evaluate(() => window.natux.settings.get());
  const stored = JSON.parse(await fs.readFile(path.join(userData, 'settings.json'), 'utf8'));
  assert.equal(settings.installId, stored.installId, 'IPC settings must be stored in the isolated profile');
  assert.ok(settings.installId);
  assert.equal(settings.onboardingCompleted, options.expectedOnboardingCompleted ?? false,
    'Packaged profile must preserve its onboarding state');
  return { page, userData, root, lockResources };
}

async function waitForLogin(page) {
  await page.getByPlaceholder(/^(Ник или email|Username or email)$/).waitFor();
}

module.exports = { launchPackaged, waitForLogin, until, verifyPackagedLockResources };
