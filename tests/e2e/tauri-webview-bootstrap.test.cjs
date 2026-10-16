const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { assertNoExistingInstallation, isolatedInstallerEnvironment } = require('./tauri-installed-helpers.cjs');

const runFile = promisify(execFile);
const repository = path.resolve(__dirname, '../..');
const enabled = process.env.NATUX_WEBVIEW_BOOTSTRAP_ACCEPTANCE === '1';

function validateEnvironment(env, username, platform) {
  const required = {
    NATUX_WEBVIEW_BOOTSTRAP_ACCEPTANCE: '1', CI: 'true', GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
    GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_EVENT_NAME: 'workflow_dispatch',
  };
  for (const [key, value] of Object.entries(required)) assert.equal(env[key], value, `Requires ${key}=${value}.`);
  assert.equal(platform, 'win32', 'Requires Windows.');
  assert.equal(username.toLowerCase(), 'runneradmin', 'Requires the actual ephemeral runneradmin account.');
  assert.match(env.GITHUB_SHA ?? '', /^[0-9a-f]{40}$/, 'Requires the exact workflow source SHA.');
}

function validateReceipt(receipt, version, sourceHeadSha) {
  assert.equal(receipt.version, version, 'Installer receipt must match the checked-out launcher version.');
  assert.equal(receipt.sourceHeadSha, sourceHeadSha, 'Installer receipt must match this workflow source commit.');
  assert.match(receipt.buildCommit ?? '', /^[0-9a-f]{40}$/, 'Receipt must identify the actual build checkout.');
  for (const key of ['installerSha512', 'nativeSha512']) {
    assert.match(receipt[key] ?? '', /^[0-9a-f]{128}$/, `Receipt ${key} must be lowercase SHA512.`);
  }
}

function assertRuntimeState(state, installed) {
  assert.equal(state.installed, installed, `WebView2 installed must be ${installed}.`);
  assert.ok(Array.isArray(state.registry) && state.registry.length === 3, 'Check must inspect all three official pv locations.');
  assert.equal(state.registry.some(entry => entry.installed === true), installed);
  assert.ok(Array.isArray(state.executablePaths));
  if (installed) {
    assert.match(state.version ?? '', /^\d+\.\d+\.\d+\.\d+$/);
    assert.ok(state.version.split('.').some(part => Number(part) > 0), 'Runtime version must exceed zero.');
    assert.ok(state.executablePaths.length > 0, 'Installed runtime must have an executable.');
  } else {
    assert.deepEqual(state.executablePaths, [], 'A missing pv alone cannot prove runtime absence.');
    assert.equal(state.version, null);
  }
}

function within(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeEnvironment(env = process.env) {
  const safe = { ...env };
  for (const key of Object.keys(safe)) {
    if (['NODE_TEST_CONTEXT', 'NATUX_EPHEMERAL_WEBVIEW_REMOVAL'].includes(key.toUpperCase())) delete safe[key];
  }
  return safe;
}

async function sha512(filename) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function regularArtifact(filename, parent, maxBytes) {
  const stat = await fs.lstat(filename);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Acceptance input must be a regular artifact.');
  assert.ok(stat.size > 0 && stat.size <= maxBytes, 'Acceptance input is empty or unbounded.');
  const real = await fs.realpath(filename);
  assert.equal(path.dirname(real).toLowerCase(), parent.toLowerCase(), 'Artifact must remain in its fixed source directory.');
  return real;
}

async function runtimeCheck() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(repository, 'scripts', 'prepare-webview2-ci.ps1'), '-Action', 'Check'],
  { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: safeEnvironment() });
  return JSON.parse(stdout);
}

async function ordinaryLocalAppData() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference = 'Stop'
    $groups = @(whoami.exe /groups /fo csv /nh | ConvertFrom-Csv -Header Name,Type,Sid,Attributes)
    if ($LASTEXITCODE -ne 0 -or @($groups | Where-Object { $_.Sid -eq 'S-1-16-8192' }).Count -ne 1) {
      throw 'Bootstrap acceptance must run with an ordinary Medium integrity token.'
    }
    [Environment]::GetFolderPath('LocalApplicationData')
  `], { windowsHide: true, timeout: 15_000, env: safeEnvironment() });
  assert.ok(process.env.LOCALAPPDATA, 'Real LOCALAPPDATA is required for the per-user prerequisite installation.');
  const actual = await fs.realpath(stdout.trim());
  assert.equal((await fs.realpath(process.env.LOCALAPPDATA)).toLowerCase(), actual.toLowerCase(),
    'Bootstrap installation must preserve the actual account LOCALAPPDATA.');
  return actual;
}

async function waitForRemoval(directory) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { await fs.access(directory); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Owned Tauri uninstall did not finish; preserving recovery files in ${path.dirname(directory)}.`);
}

async function uninstallOwned(installDirectory, owner, env) {
  assert.ok(within(owner, installDirectory));
  try { await fs.access(installDirectory); } catch (error) {
    if (error.code === 'ENOENT') { await assertNoExistingInstallation(); return; }
    throw error;
  }
  const uninstaller = await regularArtifact(path.join(installDirectory, 'uninstall.exe'), installDirectory, 100 * 1024 * 1024);
  assert.ok(within(owner, uninstaller));
  await runFile(uninstaller, ['/S'], { env, windowsHide: true, timeout: 90_000, maxBuffer: 1024 * 1024 });
  await waitForRemoval(installDirectory);
  await assertNoExistingInstallation();
}

test('WebView2 bootstrap acceptance requires explicit ephemeral official CI and the actual runner account', () => {
  const env = { NATUX_WEBVIEW_BOOTSTRAP_ACCEPTANCE: '1', CI: 'true', GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows', GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: 'a'.repeat(40) };
  validateEnvironment(env, 'runneradmin', 'win32');
  for (const key of Object.keys(env)) assert.throws(() => validateEnvironment({ ...env, [key]: 'wrong' }, 'runneradmin', 'win32'));
  assert.throws(() => validateEnvironment(env, 'normal-user', 'win32'), /actual ephemeral/);
  assert.throws(() => validateEnvironment(env, 'runneradmin', 'linux'), /Windows/);
});

test('source receipt and runtime state cannot substitute missing hashes or registry-only absence', () => {
  const receipt = { version: '1.10.0', sourceHeadSha: 'a'.repeat(40), buildCommit: 'b'.repeat(40),
    installerSha512: 'c'.repeat(128), nativeSha512: 'd'.repeat(128) };
  validateReceipt(receipt, '1.10.0', 'a'.repeat(40));
  for (const key of Object.keys(receipt)) assert.throws(() => validateReceipt({ ...receipt, [key]: 'wrong' }, '1.10.0', 'a'.repeat(40)));
  const missing = { installed: false, version: null, registry: [{ installed: false }, { installed: false }, { installed: false }], executablePaths: [] };
  assertRuntimeState(missing, false);
  assert.throws(() => assertRuntimeState({ ...missing, executablePaths: ['runtime.exe'] }, false), /missing pv alone/);
  assert.throws(() => assertRuntimeState({ ...missing, installed: true, version: '0.0.0.0', registry: [{ installed: true }, {}, {}] }, true), /exceed zero/);
  const cleaned = safeEnvironment({ NODE_TEST_CONTEXT: 'child-v8', NATUX_EPHEMERAL_WEBVIEW_REMOVAL: 'YES', LOCALAPPDATA: 'real-local' });
  assert.deepEqual(cleaned, { LOCALAPPDATA: 'real-local' });
});

test('unmodified NSIS installs WebView2 on a runtime-free ordinary Windows account and launches Tauri', {
  skip: enabled ? false : 'Explicit official hosted Windows workflow_dispatch after separately guarded runtime preparation is required.',
  timeout: 12 * 60_000,
}, async (t) => {
  validateEnvironment(process.env, os.userInfo().username, process.platform);
  const localAppData = await ordinaryLocalAppData();
  const packageJson = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8'));
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const runtimeDirectory = await fs.realpath(path.join(repository, 'tests', '.runtime'));
  assert.ok(within(await fs.realpath(repository), runtimeDirectory));
  const source = await fs.realpath(path.join(runtimeDirectory, 'webview-source'));
  assert.equal(path.dirname(source), runtimeDirectory);
  const installer = await regularArtifact(path.join(source, `NatuxWorld-${packageJson.version}-x64-setup.exe`), source, 250 * 1024 * 1024);
  const hashFile = await regularArtifact(path.join(source, 'native.sha512'), source, 132);
  const receiptFile = await regularArtifact(path.join(source, 'receipt.json'), source, 8192);
  const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
  validateReceipt(receipt, packageJson.version, process.env.GITHUB_SHA);
  const expectedNative = (await fs.readFile(hashFile, 'utf8')).trim();
  assert.match(expectedNative, /^[0-9a-f]{128}$/);
  assert.equal(expectedNative, receipt.nativeSha512);
  const installerBefore = await sha512(installer);
  assert.equal(installerBefore, receipt.installerSha512, 'Installer bytes must match the accepted build artifact.');
  const resultFile = path.join(runtimeDirectory, 'webview-result.json');
  await fs.rm(resultFile, { force: true });
  const before = await runtimeCheck();
  assertRuntimeState(before, false);
  await assertNoExistingInstallation();
  const tempParent = await fs.realpath(os.tmpdir());
  const owner = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-installed-webview-'));
  const installDirectory = path.join(owner, 'app');
  const appData = path.join(owner, 'appdata');
  await fs.mkdir(appData);
  const env = safeEnvironment(isolatedInstallerEnvironment(appData, localAppData));
  let started = false;
  let uninstalled = false;
  let after;
  let nativeInstalled;
  let installerAfter;
  try {
    started = true;
    await runFile(installer, ['/S', `/D=${installDirectory}`],
      { env, windowsHide: true, timeout: 7 * 60_000, maxBuffer: 4 * 1024 * 1024 });
    const executable = await regularArtifact(path.join(installDirectory, 'natux-world-launcher-native.exe'), installDirectory, 250 * 1024 * 1024);
    assert.ok(within(owner, executable));
    nativeInstalled = await sha512(executable);
    assert.equal(nativeInstalled, expectedNative, 'NSIS must install the accepted native executable without alteration.');
    after = await runtimeCheck();
    assertRuntimeState(after, true);
    const smoke = await runFile(process.execPath, ['--test', path.join(repository, 'tests', 'e2e', 'tauri-packaged.test.cjs')], {
      cwd: repository, windowsHide: true, timeout: 90_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...env, NATUX_TAURI_E2E_EXECUTABLE: executable, NATUX_TAURI_E2E_PROFILE_ROOT: owner },
    });
    t.diagnostic(smoke.stdout.trim());
    installerAfter = await sha512(installer);
    assert.equal(installerAfter, installerBefore, 'Bootstrap acceptance must use the unmodified NSIS throughout.');
    await uninstallOwned(installDirectory, owner, env);
    uninstalled = true;
    assertRuntimeState(await runtimeCheck(), true);
  } finally {
    if (started && !uninstalled) await uninstallOwned(installDirectory, owner, env);
    const actualOwner = await fs.realpath(owner);
    assert.equal(path.dirname(actualOwner), tempParent);
    assert.ok(path.basename(actualOwner).startsWith('natux-tauri-installed-'));
    await fs.rm(actualOwner, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
  await fs.writeFile(resultFile, `${JSON.stringify({
    success: true, version: packageJson.version, sourceHeadSha: process.env.GITHUB_SHA, buildCommit: receipt.buildCommit,
    sourceRun: process.env.NATUX_WEBVIEW_BOOTSTRAP_SOURCE_RUN ?? null,
    installerBeforeSha512: installerBefore, installerAfterSha512: installerAfter,
    nativeExpectedSha512: expectedNative, nativeInstalledSha512: nativeInstalled,
    before, after, installerUninstalled: true, ownerRemoved: true, completedAt: new Date().toISOString(),
  }, null, 2)}\n`, { flag: 'wx' });
});
