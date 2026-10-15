const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function until(operation, message) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function openPortable(directory, isolatedAppData) {
  const port = await unusedPort();
  const env = { ...process.env, APPDATA: isolatedAppData, LOCALAPPDATA: isolatedAppData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_E2E_')
      || ['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER'].includes(key)) delete env[key];
  }
  const child = spawn(path.join(directory, 'natux-world-launcher-native.exe'), [], {
    cwd: directory, env, windowsHide: true, stdio: 'ignore',
  });
  let browser;
  try {
    await until(async () => {
      if (child.exitCode !== null) throw new Error(`Portable launcher exited: ${child.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(750) })).ok; }
      catch { return false; }
    }, 'Portable WebView did not become ready');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = await until(async () => browser.contexts().flatMap(context => context.pages())[0], 'Portable page missing');
    await page.waitForFunction(() => typeof window.__TAURI_INTERNALS__?.invoke === 'function');
    await page.getByPlaceholder(/Ник или email|Username or email/).waitFor({ state: 'visible', timeout: 20_000 });
    return {
      settings: await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get')),
      close: async () => {
        await browser.close();
        if (child.exitCode === null) await runFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        await until(async () => child.exitCode !== null, 'Portable process did not stop');
      },
    };
  } catch (error) {
    await browser?.close().catch(() => {});
    if (child.exitCode === null && child.pid) {
      await runFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    }
    throw error;
  }
}

test('native portable distribution opens, moves its profile and leaves installed data alone', {
  skip: process.platform !== 'win32', timeout: 120_000,
}, async () => {
  const version = require('../../package.json').version;
  const archive = path.join(root, 'release/tauri', `NatuxWorld-${version}-x64-portable.zip`);
  await fs.access(archive);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'natux-portable-e2e-'));
  const original = path.join(temporary, 'original');
  const moved = path.join(temporary, 'moved');
  const parallel = path.join(temporary, 'parallel');
  const appData = path.join(temporary, 'app-data');
  let instance;
  let parallelInstance;
  try {
    await fs.mkdir(appData);
    const sentinel = path.join(appData, 'sentinel.bin');
    await fs.writeFile(sentinel, 'installed profile must remain untouched');
    await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      path.join(root, 'scripts/extract-tauri-portable.ps1'), '-Archive', archive, '-DestinationDirectory', original],
    { windowsHide: true });
    const profile = path.join(original, 'profile');
    await fs.mkdir(path.join(profile, 'minecraft/saves/portable-world'), { recursive: true });
    await fs.writeFile(path.join(profile, 'minecraft/saves/portable-world/level.dat'), 'portable world fixture');
    const installId = randomUUID();
    await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ memory: 3072, installId,
      autoUpdate: false, launchOnStartup: false, onboardingCompleted: true, crashReports: false, telemetryEnabled: false }));
    instance = await openPortable(original, appData);
    assert.equal(instance.settings.memory, 3072);
    assert.equal(instance.settings.installId, installId);
    assert.equal(instance.settings.startupSupported, false);
    await instance.close();
    instance = undefined;
    await fs.rename(original, moved);
    instance = await openPortable(moved, appData);
    assert.equal(instance.settings.memory, 3072);
    assert.equal(instance.settings.installId, installId);
    assert.equal(await fs.readFile(path.join(moved, 'profile/minecraft/saves/portable-world/level.dat'), 'utf8'), 'portable world fixture');
    await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      path.join(root, 'scripts/extract-tauri-portable.ps1'), '-Archive', archive, '-DestinationDirectory', parallel],
    { windowsHide: true });
    await fs.mkdir(path.join(parallel, 'profile'));
    const parallelInstallId = randomUUID();
    await fs.writeFile(path.join(parallel, 'profile/settings.json'), JSON.stringify({ memory: 6144,
      installId: parallelInstallId, autoUpdate: false, launchOnStartup: false, onboardingCompleted: true }));
    parallelInstance = await openPortable(parallel, appData);
    assert.equal(parallelInstance.settings.memory, 6144);
    assert.equal(parallelInstance.settings.installId, parallelInstallId);
    assert.notEqual(parallelInstance.settings.installId, instance.settings.installId);
    assert.deepEqual(await fs.readdir(appData), ['sentinel.bin']);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'installed profile must remain untouched');
    const files = await fs.readdir(moved);
    assert.ok(!files.some(name => /electron|node_modules|\.asar$|preload/i.test(name)));
  } finally {
    await parallelInstance?.close();
    await instance?.close();
    assert.equal(path.dirname(temporary), await fs.realpath(os.tmpdir()));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
