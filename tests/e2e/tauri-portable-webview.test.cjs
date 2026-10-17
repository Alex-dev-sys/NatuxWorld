const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');
const { assertNoExistingInstallation } = require('./tauri-installed-helpers.cjs');

const runFile = promisify(execFile);
const repository = path.resolve(__dirname, '../..');
const uiScript = path.join(__dirname, 'tauri-portable-webview-ui.ps1');
const prompt = 'NATUX WORLD requires Microsoft WebView2. Download and install it now?';
const enabled = process.env.NATUX_PORTABLE_WEBVIEW_ACCEPTANCE === '1';
const quote = value => `'${value.replaceAll("'", "''")}'`;

function validateEnvironment(env, username, platform) {
  const required = { NATUX_PORTABLE_WEBVIEW_ACCEPTANCE: '1', CI: 'true', GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows', GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld',
    GITHUB_EVENT_NAME: 'workflow_dispatch' };
  for (const [key, value] of Object.entries(required)) assert.equal(env[key], value, `Requires ${key}=${value}.`);
  assert.equal(platform, 'win32');
  assert.equal(username.toLowerCase(), 'runneradmin', 'Requires the actual ephemeral runner account.');
  assert.match(env.GITHUB_SHA ?? '', /^[0-9a-f]{40}$/);
}

function validateReceipt(receipt, version, head) {
  assert.equal(receipt.version, version);
  assert.equal(receipt.sourceHeadSha, head);
  assert.match(receipt.buildCommit ?? '', /^[0-9a-f]{40}$/);
  for (const key of ['portableSha512', 'nativeSha512']) assert.match(receipt[key] ?? '', /^[0-9a-f]{128}$/);
}

function runtimeState(state, installed) {
  assert.equal(state.installed, installed);
  assert.ok(Array.isArray(state.registry) && state.registry.length === 3);
  assert.equal(state.registry.some(entry => entry.installed === true), installed);
  assert.ok(Array.isArray(state.executablePaths));
  if (installed) {
    assert.match(state.version ?? '', /^\d+\.\d+\.\d+\.\d+$/);
    assert.ok(state.version.split('.').some(value => Number(value) > 0));
    assert.ok(state.executablePaths.length > 0);
  } else { assert.equal(state.version, null); assert.deepEqual(state.executablePaths, []); }
}

function childEnvironment(appData, localAppData, port, source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    const name = key.toUpperCase();
    if (name.startsWith('NATUX_') || name.startsWith('WEBVIEW2_') ||
      ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL'].includes(name)) delete env[key];
  }
  return { ...env, APPDATA: appData, LOCALAPPDATA: localAppData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
}

async function powershell(source, env = process.env) {
  return runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(
    `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${source}`, 'utf16le').toString('base64')],
  { env, windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024 });
}

async function ui(action, owner, args = [], env = process.env) {
  const parent = await fs.realpath(os.tmpdir());
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', uiScript, '-Action', action, '-OwnerRoot', owner, ...args],
  { env: { ...env, TEMP: parent, TMP: parent, NATUX_EPHEMERAL_WEBVIEW_REMOVAL: '' }, windowsHide: true,
    timeout: 45_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}

async function sha512(filename) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function artifact(filename, parent, maxBytes) {
  const stat = await fs.lstat(filename);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maxBytes);
  const real = await fs.realpath(filename);
  assert.equal(path.dirname(real).toLowerCase(), parent.toLowerCase());
  assert.equal(real.toLowerCase(), filename.toLowerCase(), 'Artifact must not traverse junctions.');
  return real;
}

async function checkRuntime() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(repository, 'scripts/prepare-webview2-ci.ps1'), '-Action', 'Check'],
  { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}

async function until(probe, message, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  do { const value = await probe(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 150)); }
  while (Date.now() < deadline);
  throw new Error(message);
}

async function helperExited(child) {
  await until(() => child.exitCode !== null || child.signalCode !== null, 'Production portable helper did not exit.', 7 * 60_000);
  assert.equal(child.signalCode, null);
  assert.equal(child.exitCode, 0);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function runKeys() {
  const { stdout } = await powershell(`
    $key = Get-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue
    $values = @{}
    if ($null -ne $key) { try { foreach ($name in @('NATUX WORLD','world.natux.launcher','electron.app.NATUX WORLD','electron.app.natux-world-launcher')) { $values[$name] = $key.GetValue($name, $null) } } finally { $key.Dispose() } }
    $values | ConvertTo-Json -Compress
  `);
  return JSON.parse(stdout);
}

test('portable prerequisite acceptance requires exact official guards and sanitizes only synthetic child context', () => {
  const env = { NATUX_PORTABLE_WEBVIEW_ACCEPTANCE: '1', CI: 'true', GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows', GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: 'a'.repeat(40) };
  validateEnvironment(env, 'runneradmin', 'win32');
  for (const key of Object.keys(env)) assert.throws(() => validateEnvironment({ ...env, [key]: 'wrong' }, 'runneradmin', 'win32'), key);
  assert.throws(() => validateEnvironment(env, 'normal-user', 'win32'));
  assert.throws(() => validateEnvironment(env, 'runneradmin', 'linux'));
  const safe = childEnvironment('synthetic', 'real-local', 1234, { NATUX_LOCAL_MODE: '1', WEBVIEW2_BROWSER_EXECUTABLE_FOLDER: 'fake', NODE_TEST_CONTEXT: '1', KEEP: 'unchanged' });
  assert.deepEqual(safe, { KEEP: 'unchanged', APPDATA: 'synthetic', LOCALAPPDATA: 'real-local',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=1234 --remote-debugging-address=127.0.0.1' });
  const receipt = { version: '1.10.0', sourceHeadSha: 'a'.repeat(40), buildCommit: 'b'.repeat(40), portableSha512: 'c'.repeat(128), nativeSha512: 'd'.repeat(128) };
  validateReceipt(receipt, '1.10.0', 'a'.repeat(40));
  for (const key of Object.keys(receipt)) assert.throws(() => validateReceipt({ ...receipt, [key]: 'wrong' }, '1.10.0', 'a'.repeat(40)));
  const absent = { installed: false, version: null, registry: [{}, {}, {}], executablePaths: [] };
  runtimeState(absent, false);
  assert.throws(() => runtimeState({ ...absent, executablePaths: ['runtime.exe'] }, false));
});

test('Win32 matching compiles but never clicks unrelated dialogs or runs any UI locally', { skip: process.platform !== 'win32' }, async () => {
  const source = await fs.readFile(path.join(repository, 'scripts/start-tauri-portable.ps1'), 'utf8');
  assert.ok(source.includes(prompt), 'Expected text must match the unchanged production prompt.');
  const { stdout } = await powershell(`
    . ${quote(uiScript)} -Action Inspect -OwnerRoot 'unused-read-only-test'
    Add-Type -TypeDefinition $dialogType
    @(
      [NatuxPortableDialog]::Matches(12,12,'NATUX WORLD','#32770',[NatuxPortableDialog]::Prompt,7)
      [NatuxPortableDialog]::Matches(12,12,'NATUX WORLD','#32770',[NatuxPortableDialog]::Prompt,6)
      [NatuxPortableDialog]::Matches(12,13,'NATUX WORLD','#32770',[NatuxPortableDialog]::Prompt,7)
      [NatuxPortableDialog]::Matches(12,12,'other','#32770',[NatuxPortableDialog]::Prompt,7)
      [NatuxPortableDialog]::Matches(12,12,'NATUX WORLD','other',[NatuxPortableDialog]::Prompt,7)
      [NatuxPortableDialog]::Matches(12,12,'NATUX WORLD','#32770','other',7)
      [NatuxPortableDialog]::Matches(12,12,'NATUX WORLD','#32770',[NatuxPortableDialog]::Prompt,1)
    ) | ConvertTo-Json -Compress
  `);
  assert.deepEqual(JSON.parse(stdout), [true, true, false, false, false, false, false]);
});

test('real ZIP preflight extracts only bounded production files and refuses traversal, symlinks and collisions', { skip: process.platform !== 'win32', timeout: 60_000 }, async () => {
  const parent = await fs.realpath(os.tmpdir());
  for (const scenario of ['valid', 'traversal', 'symlink', 'duplicate', 'oversized']) {
    const owner = await fs.mkdtemp(path.join(parent, 'natux-portable-webview-unit-'));
    try {
      const archive = path.join(owner, 'fixture.zip');
      await powershell(`
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        Add-Type -AssemblyName System.IO.Compression
        $zip = [IO.Compression.ZipFile]::Open(${quote(archive)}, [IO.Compression.ZipArchiveMode]::Create)
        try {
          $names = @('natux-world-launcher-native.exe','natux-lock/natux-lock-agent.jar','start-portable.ps1','Start NATUX WORLD.cmd','natux-portable.json')
          if ('${scenario}' -eq 'traversal') { $names[4] = '../escaped.json' }
          if ('${scenario}' -eq 'duplicate') { $names += 'NATUX-WORLD-LAUNCHER-NATIVE.EXE' }
          foreach ($name in $names) {
            $entry = $zip.CreateEntry($name)
            if ('${scenario}' -eq 'symlink' -and $name -eq $names[0]) { $entry.ExternalAttributes = -1610612736 }
            $stream = $entry.Open()
            try { $size = if ('${scenario}' -eq 'oversized' -and $name -like '*.jar') { 21MB } else { 32 }; $bytes = New-Object byte[] $size; $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
          }
        } finally { $zip.Dispose() }
      `);
      if (scenario === 'valid') {
        assert.equal((await ui('Extract', owner, ['-Archive', archive])).fileCount, 5);
        assert.equal((await fs.stat(path.join(owner, 'app/start-portable.ps1'))).size, 32);
        await assert.rejects(() => ui('Inspect', owner, [], { ...process.env, NATUX_PORTABLE_WEBVIEW_ACCEPTANCE: '' }), /UI requires/);
      } else {
        await assert.rejects(() => ui('Extract', owner, ['-Archive', archive]));
        await assert.rejects(() => fs.access(path.join(owner, 'app')), /ENOENT/);
      }
    } finally {
      const actual = await fs.realpath(owner);
      assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase());
      assert.ok(path.basename(actual).startsWith('natux-portable-webview-unit-'));
      await fs.rm(actual, { recursive: true, force: true });
    }
  }
});

test('accepted portable ZIP handles real No and Yes prerequisite dialogs before native launch', {
  skip: enabled ? false : 'Requires explicit official disposable Windows CI with an absent WebView2 runtime.', timeout: 12 * 60_000,
}, async (t) => {
  validateEnvironment(process.env, os.userInfo().username, process.platform);
  const { stdout: local } = await powershell(`
    $groups = @(whoami.exe /groups /fo csv /nh | ConvertFrom-Csv -Header Name,Type,Sid,Attributes)
    if ($LASTEXITCODE -ne 0 -or @($groups | Where-Object { $_.Sid -eq 'S-1-16-8192' }).Count -ne 1) { throw 'Acceptance requires Medium integrity.' }
    [Environment]::GetFolderPath('LocalApplicationData')
  `);
  const localAppData = await fs.realpath(local.trim());
  assert.equal((await fs.realpath(process.env.LOCALAPPDATA)).toLowerCase(), localAppData.toLowerCase());
  const version = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const runtime = await fs.realpath(path.join(repository, 'tests/.runtime'));
  assert.equal(runtime.toLowerCase(), path.join(repository, 'tests/.runtime').toLowerCase());
  const source = await fs.realpath(path.join(runtime, 'webview-source'));
  assert.equal(path.dirname(source), runtime);
  const zip = await artifact(path.join(source, `NatuxWorld-${version}-x64-portable.zip`), source, 350 * 1024 * 1024);
  const receipt = JSON.parse(await fs.readFile(await artifact(path.join(source, 'receipt.json'), source, 8192), 'utf8'));
  validateReceipt(receipt, version, process.env.GITHUB_SHA);
  const nativeHash = (await fs.readFile(await artifact(path.join(source, 'native.sha512'), source, 132), 'utf8')).trim();
  assert.equal(nativeHash, receipt.nativeSha512);
  assert.equal(await sha512(zip), receipt.portableSha512);
  const resultFile = path.join(runtime, 'portable-webview-result.json');
  await fs.rm(resultFile, { force: true });
  const before = await checkRuntime(); runtimeState(before, false);
  await assertNoExistingInstallation();
  const startupBefore = await runKeys();
  const parent = await fs.realpath(os.tmpdir());
  const owner = await fs.mkdtemp(path.join(parent, 'natux-portable-webview-'));
  let helper; let browser; let extracted = false; let failure; let after; let noDialog; let yesDialog; let policy;
  try {
    await ui('Extract', owner, ['-Archive', zip]); extracted = true;
    const app = path.join(owner, 'app');
    const executable = await artifact(path.join(app, 'natux-world-launcher-native.exe'), app, 300 * 1024 * 1024);
    assert.equal(await sha512(executable), nativeHash);
    for (const [packed, original] of [['start-portable.ps1', 'start-tauri-portable.ps1'], ['Start NATUX WORLD.cmd', 'start-tauri-portable.cmd']]) {
      assert.equal(await sha512(path.join(app, packed)), await sha512(path.join(repository, 'scripts', original)), 'Production helper must remain unmodified.');
    }
    const profile = path.join(app, 'profile'); const appData = path.join(owner, 'synthetic-appdata');
    await fs.mkdir(profile); await fs.mkdir(appData);
    const settings = { installId: randomUUID(), language: 'en', autoUpdate: false, autoLaunch: false, launchOnStartup: false,
      onboardingCompleted: true, telemetryEnabled: false, crashReports: false };
    await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify(settings));
    const port = await freePort(); const env = childEnvironment(appData, localAppData, port);
    const start = () => {
      const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(app, 'start-portable.ps1')],
        { cwd: app, env, windowsHide: true, stdio: 'ignore' });
      child.on('error', error => { t.diagnostic(`Owned production helper failed: ${error.code}`); });
      return child;
    };
    helper = start();
    noDialog = await ui('Dialog', owner, ['-ProcessId', String(helper.pid), '-ButtonId', '7']);
    await helperExited(helper); helper = undefined;
    runtimeState(await checkRuntime(), false);
    assert.deepEqual(await ui('Inspect', owner), []);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, 'settings.json'), 'utf8')), settings);
    helper = start();
    yesDialog = await ui('Dialog', owner, ['-ProcessId', String(helper.pid), '-ButtonId', '6']);
    await helperExited(helper); helper = undefined;
    after = await checkRuntime(); runtimeState(after, true);
    const processes = await until(async () => { const found = await ui('Inspect', owner); return found.length ? found : false; }, 'Owned portable native app did not start.');
    assert.equal(processes.length, 1);
    const endpoint = `http://127.0.0.1:${port}`;
    await until(async () => { try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }, 'Native portable WebView did not expose CDP.');
    browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
    const page = await until(() => browser.contexts().flatMap(context => context.pages())[0], 'Native portable page missing.');
    await page.waitForFunction(() => typeof window.__TAURI_INTERNALS__?.invoke === 'function');
    await page.getByPlaceholder('Username or email').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_version')), version);
    const actual = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'));
    for (const [key, value] of Object.entries(settings)) assert.deepEqual(actual[key], value);
    assert.equal(actual.startupSupported, false);
    const startupError = await page.evaluate(async () => { try { await window.__TAURI_INTERNALS__.invoke('settings_set', { settings: { launchOnStartup: true } }); return null; } catch (error) { return String(error); } });
    assert.equal(startupError, 'Автозапуск недоступен для переносной копии лаунчера');
    assert.equal((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('settings_get'))).launchOnStartup, false);
    await page.evaluate(async () => {
      window.__portablePolicyEvents = [];
      const api = window.__TAURI_INTERNALS__;
      await api.invoke('plugin:event|listen', { event: 'updater:event', target: { kind: 'Any' }, handler: api.transformCallback(event => window.__portablePolicyEvents.push(event.payload)) });
      await api.invoke('updater_install');
    });
    await page.waitForFunction(() => window.__portablePolicyEvents.some(event => event.type === 'error' && /manual update/.test(event.message)));
    policy = { manualUpdate: true, autostartRefused: true, startupError };
    assert.ok((await fs.readdir(path.join(profile, 'EBWebView'))).length > 0);
    await assert.rejects(() => fs.access(path.join(appData, 'natux-world-launcher')), /ENOENT/);
    assert.deepEqual(await runKeys(), startupBefore);
    await assertNoExistingInstallation();
    assert.equal(await sha512(executable), nativeHash);
    assert.equal(await sha512(zip), receipt.portableSha512);
  } catch (error) { failure = error; } finally {
    try {
      await browser?.close();
      if (helper?.pid && helper.exitCode === null && helper.signalCode === null) { helper.kill(); await until(() => helper.exitCode !== null || helper.signalCode !== null, 'Owned PowerShell helper did not stop.'); }
      if (extracted) { await ui('Stop', owner); await until(async () => (await ui('Inspect', owner)).length === 0, 'Owned portable process tree remained.'); }
      if (!failure) {
        const actual = await fs.realpath(owner); assert.equal(path.dirname(actual), parent);
        assert.ok(path.basename(actual).startsWith('natux-portable-webview-'));
        await fs.rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      }
    } catch (error) { if (failure) t.diagnostic(`Cleanup also failed: ${error.stack ?? error}`); else failure = error; }
  }
  if (failure) { t.diagnostic(`Preserved owned recovery files: ${owner}`); throw failure; }
  await fs.writeFile(resultFile, `${JSON.stringify({ success: true, version, sourceHeadSha: process.env.GITHUB_SHA,
    buildCommit: receipt.buildCommit, sourceRun: process.env.NATUX_PORTABLE_WEBVIEW_SOURCE_RUN ?? null,
    portableSha512: receipt.portableSha512, nativeSha512: nativeHash, before, after,
    noDialog, yesDialog, policy, ownerRemoved: true, completedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
});
