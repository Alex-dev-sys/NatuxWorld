const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { launchPackaged, waitForLogin } = require('./packaged-helpers.cjs');

const runFile = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const INSTALLER_DIRECTORY = path.join(root, 'src', 'native', 'target', 'release', 'bundle', 'nsis');

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function findInstalledFile(directory, predicate) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && predicate(entry.name)) return candidate;
    if (entry.isDirectory()) {
      const nested = await findInstalledFile(candidate, predicate);
      if (nested) return nested;
    }
  }
  return null;
}

async function listInstalledFiles(directory, root = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile()) files.push(path.relative(root, candidate));
    if (entry.isDirectory()) files.push(...await listInstalledFiles(candidate, root));
  }
  return files;
}

async function measureInstalledDirectory(directory) {
  const files = await listInstalledFiles(directory);
  const sizes = await Promise.all(files.map(async (file) => (await fs.stat(path.join(directory, file))).size));
  return { fileCount: files.length, bytes: sizes.reduce((total, size) => total + size, 0) };
}

async function waitForRemoval(directory, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(directory);
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

test('NSIS install and uninstall preserve the isolated legacy user profile', {
  timeout: 180_000,
}, async (t) => {
  if (process.platform !== 'win32') {
    t.skip('The Tauri NSIS installation test requires Windows.');
    return;
  }

  const repository = await fs.realpath(root);
  let installerCandidate = process.env.NATUX_TAURI_E2E_INSTALLER
    ? path.resolve(process.env.NATUX_TAURI_E2E_INSTALLER)
    : null;
  if (!installerCandidate) {
    const installers = (await fs.readdir(INSTALLER_DIRECTORY))
      .filter((name) => /-setup\.exe$/i.test(name))
      .map((name) => path.join(INSTALLER_DIRECTORY, name));
    assert.equal(installers.length, 1, 'expected exactly one current NSIS setup artifact');
    [installerCandidate] = installers;
  }
  const installer = await fs.realpath(installerCandidate).catch(() => {
    throw new Error('Tauri NSIS installer missing. Run npm run tauri:build -- --bundles nsis first.');
  });
  assert.ok(isWithin(repository, installer), 'installer must be a repository build artifact');
  assert.match(path.basename(installer), /-setup\.exe$/i);

  const tempParent = await fs.realpath(os.tmpdir());
  const testRoot = await fs.mkdtemp(path.join(tempParent, 'natux-tauri-installed-'));
  const installDirectory = path.join(testRoot, 'app');
  let installationStarted = false;
  let uninstalled = false;

  try {
    installationStarted = true;
    const installResult = await runFile(installer, ['/S', `/D=${installDirectory}`], {
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(installResult.error, undefined);

    const installedExecutable = await findInstalledFile(
      installDirectory,
      (name) => name.toLowerCase() === 'natux-world-launcher-native.exe',
    );
    assert.ok(installedExecutable, 'installed Tauri executable must be present');
    const executableRealPath = await fs.realpath(installedExecutable);
    assert.ok(isWithin(installDirectory, executableRealPath), 'installed executable must remain in the isolated directory');
    const installedFootprint = await measureInstalledDirectory(installDirectory);
    t.diagnostic(`Installed Tauri app: ${installedFootprint.fileCount} files, ${installedFootprint.bytes} bytes (${(installedFootprint.bytes / 1024 / 1024).toFixed(2)} MiB)`);

    const smokeEnvironment = {
      ...process.env,
      NATUX_TAURI_E2E_EXECUTABLE: executableRealPath,
      NATUX_TAURI_E2E_PROFILE_ROOT: testRoot,
    };
    delete smokeEnvironment.NODE_TEST_CONTEXT;
    const smoke = await runFile(process.execPath, [
      '--test',
      path.join(repository, 'tests', 'e2e', 'tauri-packaged.test.cjs'),
    ], {
      cwd: repository,
      env: smokeEnvironment,
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(smoke.error, undefined, `installed packaged smoke failed:\n${smoke.stdout}\n${smoke.stderr}`);
    t.diagnostic(smoke.stdout.trim());

    const packageJson = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8'));
    const userData = path.join(testRoot, 'appdata', packageJson.name);
    try {
      await fs.access(path.join(userData, 'account.json'));
    } catch {
      const files = await listInstalledFiles(testRoot);
      throw new Error(`Packaged smoke did not leave the isolated profile under APPDATA. Files: ${files.join(', ')}\n${smoke.stdout}\n${smoke.stderr}`);
    }

    const uninstaller = await findInstalledFile(
      installDirectory,
      (name) => /^(?:uninstall|unins\d*|uninstaller)\.exe$/i.test(name),
    );
    assert.ok(uninstaller, 'installed NSIS uninstaller must be present');
    const uninstallerRealPath = await fs.realpath(uninstaller);
    assert.ok(isWithin(installDirectory, uninstallerRealPath), 'uninstaller must remain in the isolated directory');
    const uninstallResult = await runFile(uninstallerRealPath, ['/S'], {
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(uninstallResult.error, undefined);
    uninstalled = true;
    const removed = await waitForRemoval(installDirectory, 10_000);
    if (!removed) {
      const remaining = await listInstalledFiles(installDirectory).catch(() => []);
      assert.fail(`NSIS uninstall left the isolated application directory behind: ${remaining.join(', ')}`);
    }

    const account = JSON.parse(await fs.readFile(path.join(userData, 'account.json'), 'utf8'));
    assert.equal(account.user.id, 'legacy-fixture', 'legacy account file must remain after uninstall');
    assert.equal(
      await fs.readFile(path.join(userData, 'minecraft', 'saves', 'LegacyWorld', 'level.dat'), 'utf8'),
      'legacy-world-fixture-must-remain-untouched',
      'world data must remain after uninstall',
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(userData, 'minecraft', 'auth.json'), 'utf8')).username,
      'Notch',
      'legacy offline profile must remain after uninstall',
    );
    assert.equal(JSON.parse(await fs.readFile(path.join(userData, 'settings.json'), 'utf8')).memory, 4096);
    assert.equal(JSON.parse(await fs.readFile(path.join(userData, 'playtime.json'), 'utf8')).totalMs, 0);

    const rollbackFiles = [
      'account.json',
      'minecraft/auth.json',
      'minecraft/saves/LegacyWorld/level.dat',
    ];
    const beforeRollback = new Map(await Promise.all(rollbackFiles.map(async (relativePath) => [
      relativePath,
      await fs.readFile(path.join(userData, relativePath)),
    ])));
    await t.test('legacy Electron launcher can use the same profile after Tauri uninstall', {
      timeout: 90_000,
    }, async (rollbackTest) => {
      const { page } = await launchPackaged(rollbackTest, {
        userData,
        profileOwnerRoot: testRoot,
        expectedOnboardingCompleted: false,
      });
      await waitForLogin(page);
      assert.deepEqual(await page.evaluate(() => window.natux.account.bootstrap()), { status: 'guest' });
    });
    for (const [relativePath, originalBytes] of beforeRollback) {
      assert.deepEqual(
        await fs.readFile(path.join(userData, relativePath)),
        originalBytes,
        `Electron rollback smoke must not modify ${relativePath}`,
      );
    }
  } finally {
    if (installationStarted && !uninstalled && await fs.access(installDirectory).then(() => true, () => false)) {
      const uninstaller = await findInstalledFile(
        installDirectory,
        (name) => /^(?:uninstall|unins\d*|uninstaller)\.exe$/i.test(name),
      ).catch(() => null);
      if (uninstaller) {
        await runFile(uninstaller, ['/S'], { windowsHide: true, timeout: 60_000 }).catch(() => {});
      }
    }

    const resolvedTestRoot = await fs.realpath(testRoot);
    assert.equal(path.dirname(resolvedTestRoot), tempParent);
    assert.ok(path.basename(resolvedTestRoot).startsWith('natux-tauri-installed-'));
    await fs.rm(resolvedTestRoot, { recursive: true, force: true });
  }
});
