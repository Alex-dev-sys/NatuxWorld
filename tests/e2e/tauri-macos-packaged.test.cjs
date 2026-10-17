const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const runFile = promisify(execFile);

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processGroupExists(groupId) {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function stopProcessGroup(child) {
  if (!child?.pid) return;

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code === 'ESRCH') return;
    throw error;
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && processGroupExists(child.pid)) {
    await delay(100);
  }
  if (processGroupExists(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    const killDeadline = Date.now() + 5_000;
    while (Date.now() < killDeadline && processGroupExists(child.pid)) {
      await delay(100);
    }
  }
  assert.equal(processGroupExists(child.pid), false, 'Tauri process group did not stop');
}

test('packaged Tauri macOS app starts with and preserves an isolated legacy profile', {
  skip: process.platform !== 'darwin',
  timeout: 120_000,
}, async (t) => {
  const configuredExecutable = process.env.NATUX_TAURI_MACOS_E2E_EXECUTABLE;
  const configuredDmg = process.env.NATUX_TAURI_MACOS_E2E_DMG;
  const expectedArchitecture = process.env.NATUX_TAURI_MACOS_E2E_ARCH;
  if (expectedArchitecture) {
    assert.ok(['x86_64', 'aarch64'].includes(expectedArchitecture));
    assert.equal(process.arch, expectedArchitecture === 'x86_64' ? 'x64' : 'arm64',
      'acceptance must run natively on the intended CPU architecture');
    assert.ok(configuredDmg && process.env.NATUX_TAURI_MACOS_E2E_EXECUTABLE_HASH_FILE,
      'native architecture acceptance requires an exact DMG and executable hash');
  }
  assert.ok(configuredExecutable || configuredDmg, 'set a repository DMG or built app executable');
  const repository = await fs.realpath(root);
  let packagedExecutable;
  if (configuredExecutable) {
    packagedExecutable = await fs.realpath(path.resolve(configuredExecutable));
    assert.ok(isWithin(repository, packagedExecutable), 'Tauri executable must be a repository build artifact');
    const parts = packagedExecutable.split(path.sep);
    assert.ok(parts.some((part, index) => part.endsWith('.app') && parts[index + 1] === 'Contents'
      && parts[index + 2] === 'MacOS'), 'Tauri executable must be inside a macOS app bundle');
  }

  const tempParent = await fs.realpath(os.tmpdir());
  const tempRoot = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-macos-e2e-'));
  const home = path.join(tempRoot, 'home');
  const temp = path.join(tempRoot, 'tmp');
  await fs.mkdir(home);
  await fs.mkdir(temp);
  const settingsFile = path.join(home, 'Library', 'Application Support', 'natux-world-launcher', 'settings.json');
  const userData = path.dirname(settingsFile);
  const profileLockFile = path.join(userData, '.profile.lock');
  const minecraftDir = path.join(userData, 'minecraft');
  const legacySettings = {
    memory: 8192,
    fullscreen: false,
    closeOnLaunch: true,
    language: 'en',
    javaPath: '/Applications/Legacy Java/bin/java',
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
  const legacyAccountFile = JSON.stringify({
    token: 'synthetic-legacy-session-fixture',
    user: { id: 'legacy-fixture', username: 'LegacyUser', email: 'legacy@example.test' },
    enc: true,
    savedAt: 1_700_000_000_000,
  }, null, 2);
  const legacyOfflineProfile = {
    uuid: 'b50ad385-829d-3141-a216-7e7d7539ba7f',
    username: 'LegacyUser',
    accessToken: '0',
    type: 'offline',
  };
  const worldMarker = Buffer.from('legacy-world-fixture-must-remain-untouched');
  const worldFile = path.join(minecraftDir, 'saves', 'LegacyWorld', 'level.dat');
  await fs.mkdir(path.dirname(worldFile), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(legacySettings, null, 2));
  await fs.writeFile(path.join(userData, 'playtime.json'), JSON.stringify(legacyPlaytime, null, 2));
  await fs.writeFile(path.join(userData, 'account.json'), legacyAccountFile);
  await fs.writeFile(path.join(minecraftDir, 'auth.json'), JSON.stringify(legacyOfflineProfile, null, 2));
  await fs.writeFile(worldFile, worldMarker);
  const env = { ...process.env, HOME: home, TMPDIR: temp };
  delete env.WEBKIT_INSPECTOR_SERVER;
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_E2E_')) delete env[key];
  }

  let child;
  let spawnError;
  let mounted = false;
  const mount = path.join(tempRoot, 'mount');
  t.after(async () => {
    let processStopped = false;
    try {
      await stopProcessGroup(child);
      processStopped = true;
      assert.deepEqual(JSON.parse(await fs.readFile(settingsFile, 'utf8')), legacySettings);
      assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(userData, 'playtime.json'), 'utf8')),
        legacyPlaytime,
      );
      assert.equal(await fs.readFile(path.join(userData, 'account.json'), 'utf8'), legacyAccountFile);
      assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(minecraftDir, 'auth.json'), 'utf8')),
        legacyOfflineProfile,
      );
      assert.deepEqual(await fs.readFile(worldFile), worldMarker);
    } finally {
      if (processStopped) {
        if (mounted) await runFile('hdiutil', ['detach', mount], { timeout: 30_000 });
        const resolvedTempRoot = await fs.realpath(tempRoot);
        assert.equal(path.dirname(resolvedTempRoot), tempParent);
        assert.ok(path.basename(resolvedTempRoot).startsWith('natux-tauri-macos-e2e-'));
        await fs.rm(resolvedTempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      }
    }
  });

  if (configuredDmg) {
    const dmg = await fs.realpath(path.resolve(configuredDmg));
    assert.ok(isWithin(repository, dmg), 'DMG must be a repository release artifact');
    assert.match(dmg, /\.dmg$/i);
    await fs.mkdir(mount);
    await runFile('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg], { timeout: 30_000 });
    mounted = true;
    const bundles = (await fs.readdir(mount)).filter((name) => name.endsWith('.app'));
    assert.equal(bundles.length, 1, 'DMG must contain exactly one app bundle');
    const installedApp = path.join(tempRoot, 'installed', bundles[0]);
    await fs.mkdir(path.dirname(installedApp));
    await fs.cp(path.join(mount, bundles[0]), installedApp, { recursive: true, verbatimSymlinks: true });
    const { stdout } = await runFile('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(installedApp, 'Contents', 'Info.plist')]);
    const name = stdout.trim();
    assert.ok(name && !/[\\/]/.test(name), 'CFBundleExecutable must be a filename');
    packagedExecutable = await fs.realpath(path.join(installedApp, 'Contents', 'MacOS', name));
    assert.ok(isWithin(installedApp, packagedExecutable));
    if (expectedArchitecture) {
      const { stdout: architecture } = await runFile('lipo', ['-archs', packagedExecutable]);
      assert.deepEqual(architecture.trim().split(/\s+/), [expectedArchitecture === 'aarch64' ? 'arm64' : 'x86_64'],
        'DMG must contain the exact thin native architecture being accepted');
    }
    const expectedVersion = process.env.NATUX_TAURI_MACOS_E2E_VERSION;
    if (expectedVersion) {
      const { stdout: version } = await runFile('/usr/libexec/PlistBuddy',
        ['-c', 'Print :CFBundleShortVersionString', path.join(installedApp, 'Contents', 'Info.plist')]);
      assert.equal(version.trim(), expectedVersion, 'DMG must contain the planned launcher version');
    }
    const hashFile = process.env.NATUX_TAURI_MACOS_E2E_EXECUTABLE_HASH_FILE;
    if (hashFile) {
      const hashPath = await fs.realpath(path.resolve(hashFile));
      assert.ok(isWithin(repository, hashPath));
      assert.ok((await fs.stat(hashPath)).size <= 132);
      const expectedHash = (await fs.readFile(hashPath, 'utf8')).trim();
      assert.match(expectedHash, /^[0-9a-f]{128}$/);
      assert.equal(createHash('sha512').update(await fs.readFile(packagedExecutable)).digest('hex'), expectedHash,
        'published DMG must install exactly the signed native executable');
    }
  }

  child = spawn(packagedExecutable, [], { cwd: repository, env, detached: true, stdio: 'ignore' });
  child.on('error', (error) => { spawnError = error; });

  let profileLockReady = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Tauri macOS app failed to start (${spawnError.code})`);
    assert.equal(child.exitCode, null, 'Tauri app exited before initializing its native services');
    try {
      await fs.access(profileLockFile);
      profileLockReady = true;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(200);
    }
  }

  assert.ok(profileLockReady, 'Tauri app did not acquire the isolated legacy profile');
  const settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  assert.equal(settings.memory, legacySettings.memory);
  assert.equal(settings.language, legacySettings.language);
  assert.equal(settings.javaPath, legacySettings.javaPath);
  assert.equal(settings.installId, legacySettings.installId);
  assert.equal(settings.onboardingCompleted, legacySettings.onboardingCompleted);
  await delay(2_000);
  assert.equal(child.exitCode, null, 'Tauri app exited immediately after native initialization');
  assert.equal(child.signalCode, null);
});
