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

async function launchPackaged(t) {
  const executable = process.env.NATUX_E2E_EXECUTABLE
    ? path.resolve(process.env.NATUX_E2E_EXECUTABLE)
    : path.join(root, 'release', 'win-unpacked', 'NATUX WORLD.exe');
  assert.ok(process.platform === 'win32' || process.env.NATUX_E2E_EXECUTABLE,
    'Set NATUX_E2E_EXECUTABLE to the packaged executable on this platform');
  await fs.access(executable).catch(() => {
    throw new Error('Packaged executable missing. Build it first or set NATUX_E2E_EXECUTABLE.');
  });
  const tempParent = await fs.realpath(os.tmpdir());
  const tempDir = await fs.mkdtemp(path.join(tempParent, 'natux-packaged-e2e-'));
  const userData = path.join(tempDir, 'user-data');
  await fs.mkdir(userData);
  let child;
  let browser;
  let page;
  let spawnError;

  t.after(async () => {
    const errors = [];
    if (page && !page.isClosed()) {
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
    // Delete only this invocation's direct mkdtemp child, never an executable or existing profile.
    const resolved = await fs.realpath(tempDir);
    assert.equal(path.dirname(resolved), tempParent);
    assert.ok(path.basename(resolved).startsWith('natux-packaged-e2e-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
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
    .find((candidate) => candidate.url().startsWith('file:')), 15_000, 'Packaged file:// renderer missing');
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => typeof window.natux?.getVersion === 'function');
  const settings = await page.evaluate(() => window.natux.settings.get());
  const stored = JSON.parse(await fs.readFile(path.join(userData, 'settings.json'), 'utf8'));
  assert.equal(settings.installId, stored.installId, 'IPC settings must be stored in the isolated profile');
  assert.ok(settings.installId);
  assert.equal(settings.onboardingCompleted, false, 'Must start with a fresh profile');
  return { page, userData, root };
}

async function waitForLogin(page) {
  await page.getByPlaceholder(/^(Ник или email|Username or email)$/).waitFor();
}

module.exports = { launchPackaged, waitForLogin, until };
