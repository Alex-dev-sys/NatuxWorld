const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(root, 'release', 'win-unpacked', 'NATUX WORLD.exe');
const TAURI_EXE = path.join(root, 'src', 'native', 'target', 'release', 'natux-world-launcher-native.exe');
const ELECTRON_INSTALLER = path.join(root, 'release', 'NATUX WORLD-Setup-1.9.15-x64.exe');
const TAURI_INSTALLER = path.join(
  root,
  'src',
  'native',
  'target',
  'release',
  'bundle',
  'nsis',
  'NATUX WORLD_1.9.15_x64-setup.exe',
);

function iterationsFromArgs() {
  const value = process.argv.find((arg) => arg.startsWith('--iterations='))?.slice('--iterations='.length) ?? '3';
  const iterations = Number(value);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
    throw new Error('--iterations must be an integer from 1 to 20');
  }
  return iterations;
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

async function waitFor(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(message);
}

function processTreeFootprint(rootPid) {
  const script = `
    $rootId = ${Number(rootPid)}
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $ids = @([int]$rootId)
    $changed = $true
    while ($changed) {
      $changed = $false
      foreach ($item in $all) {
        $parentId = [int]$item.ParentProcessId
        $processId = [int]$item.ProcessId
        if (($ids -contains $parentId) -and ($ids -notcontains $processId)) {
          $ids += $processId
          $changed = $true
        }
      }
    }
    $processes = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
    $workingSetBytes = [long](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
    [ordered]@{ processCount = $processes.Count; workingSetBytes = $workingSetBytes } | ConvertTo-Json -Compress
  `;
  const output = require('node:child_process').execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
  ).trim();
  const result = JSON.parse(output);
  return {
    processCount: result.processCount,
    workingSetBytes: result.workingSetBytes,
    workingSetMiB: Number((result.workingSetBytes / 1024 / 1024).toFixed(1)),
  };
}

async function buildAppEnvironment(app, profileRoot, port) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_E2E_') || [
      'VITE_DEV_SERVER_URL',
      'ELECTRON_RUN_AS_NODE',
      'NODE_OPTIONS',
      'ELECTRON_DISABLE_SANDBOX',
      'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER',
    ].includes(key)) {
      delete env[key];
    }
  }

  if (app === 'electron') {
    return {
      env,
      args: [`--user-data-dir=${path.join(profileRoot, 'user-data')}`, `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1'],
    };
  }

  const appData = path.join(profileRoot, 'appdata');
  const localAppData = path.join(profileRoot, 'local-appdata');
  await fs.mkdir(appData);
  await fs.mkdir(localAppData);
  env.APPDATA = appData;
  env.LOCALAPPDATA = localAppData;
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port}`;
  return { env, args: [] };
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    await runFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 15_000,
    });
  } catch {
    if (child.exitCode === null && child.signalCode === null) throw new Error('Desktop app process tree did not stop');
  }
}

async function measureOne(app, executable, iteration) {
  const tempParent = await fs.realpath(os.tmpdir());
  const profileRoot = await fs.mkdtemp(path.join(tempParent, `natux-baseline-${app}-`));
  const port = await unusedPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const { env, args } = await buildAppEnvironment(app, profileRoot, port);
  let child;
  let browser;
  let spawnError;

  try {
    const startedAt = performance.now();
    child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: 'ignore' });
    child.on('error', (error) => { spawnError = error; });
    await waitFor(async () => {
      if (spawnError) throw new Error(`${app} failed to start (${spawnError.code})`);
      assert.equal(child.exitCode, null, `${app} exited before its renderer started`);
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
        return response.ok;
      } catch { return false; }
    }, 30_000, `${app} renderer did not expose its test-only CDP endpoint`);

    browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
    const page = await waitFor(
      () => browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.isClosed()),
      10_000,
      `${app} renderer page was not created`,
    );
    await page.waitForFunction(() => document.title === 'NATUX WORLD'
      && document.querySelector('#root')?.childElementCount > 0
      && (typeof window.natux?.settings?.get === 'function'
        || typeof window.__TAURI_INTERNALS__?.invoke === 'function'), { timeout: 20_000 });
    const uiReadyMs = Number((performance.now() - startedAt).toFixed(1));
    const nativeRoundTrip = await page.evaluate(async () => {
      const samples = [];
      for (let index = 0; index < 12; index += 1) {
        const start = performance.now();
        if (window.natux?.settings?.get) await window.natux.settings.get();
        else await window.__TAURI_INTERNALS__.invoke('settings_get');
        samples.push(performance.now() - start);
      }
      samples.sort((left, right) => left - right);
      return Number(((samples[5] + samples[6]) / 2).toFixed(2));
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));
    const memory = processTreeFootprint(child.pid);
    return { app, iteration, uiReadyMs, settingsRoundTripMedianMs: nativeRoundTrip, ...memory };
  } finally {
    if (browser) await browser.close();
    await stopProcessTree(child);
    const resolvedProfile = await fs.realpath(profileRoot);
    assert.equal(path.dirname(resolvedProfile), tempParent, 'temporary app profile escaped the system temp directory');
    assert.ok(path.basename(resolvedProfile).startsWith(`natux-baseline-${app}-`));
    await fs.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This baseline runner currently targets Windows x64 only');
  const iterations = iterationsFromArgs();
  const executables = { electron: ELECTRON_EXE, tauri: TAURI_EXE };
  for (const executable of [...Object.values(executables), ELECTRON_INSTALLER, TAURI_INSTALLER]) {
    await fs.access(executable).catch(() => { throw new Error(`Required built artifact is missing: ${executable}`); });
  }
  const installers = {
    electronBytes: (await fs.stat(ELECTRON_INSTALLER)).size,
    tauriBytes: (await fs.stat(TAURI_INSTALLER)).size,
  };
  const measurements = [];
  for (const app of ['electron', 'tauri']) {
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      measurements.push(await measureOne(app, executables[app], iteration));
    }
  }
  process.stdout.write(`${JSON.stringify({ platform: 'windows-x64', version: '1.9.15', iterations, installers, measurements }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Desktop baseline failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
