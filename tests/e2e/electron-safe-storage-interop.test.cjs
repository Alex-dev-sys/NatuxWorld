const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const legacyRequire = createRequire(path.resolve(__dirname, '../../electron/package.json'));

test('Electron userData uses the packaged app identity used by the Tauri legacy resolver', {
  skip: !['win32', 'darwin'].includes(process.platform),
}, () => {
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'natux-userdata-path-'));
  assert.equal(path.dirname(tempRoot), tempParent, 'test profile must stay inside the OS temp directory');

  const appRoot = path.join(tempRoot, 'app');
  const appDataPath = path.join(tempRoot, 'app-data');
  const resultPath = path.join(tempRoot, 'resolved-user-data.txt');
  fs.mkdirSync(appRoot);
  fs.mkdirSync(appDataPath);
  const packageMetadata = require('../../package.json');
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
    name: packageMetadata.name,
    ...(packageMetadata.productName ? { productName: packageMetadata.productName } : {}),
    version: packageMetadata.version,
    main: 'main.cjs',
  }), 'utf8');
  fs.writeFileSync(path.join(appRoot, 'main.cjs'), `
    const { app } = require('electron');
    const fs = require('node:fs');
    app.setPath('appData', process.env.NATUX_E2E_APP_DATA);
    app.whenReady().then(() => {
      fs.writeFileSync(process.env.NATUX_E2E_USER_DATA_RESULT, app.getPath('userData'));
      app.quit();
    });
  `, 'utf8');

  try {
    const electronPath = legacyRequire('electron');
    const childEnvironment = {
      ...process.env,
      NATUX_E2E_APP_DATA: appDataPath,
      NATUX_E2E_USER_DATA_RESULT: resultPath,
    };
    delete childEnvironment.ELECTRON_RUN_AS_NODE;
    delete childEnvironment.NODE_OPTIONS;
    const child = spawnSync(electronPath, [appRoot], {
      cwd: appRoot,
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
      env: childEnvironment,
    });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const expectedName = packageMetadata.productName ?? packageMetadata.name;
    assert.equal(fs.readFileSync(resultPath, 'utf8'), path.join(appDataPath, expectedName));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Electron async safeStorage reads a token encrypted by the legacy sync API', {
  skip: process.platform !== 'win32',
}, () => {
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'natux-safe-storage-interop-'));
  assert.equal(path.dirname(tempRoot), tempParent, 'test profile must stay inside the OS temp directory');

  const entryPath = path.join(tempRoot, 'main.cjs');
  const userDataPath = path.join(tempRoot, 'user-data');
  fs.mkdirSync(userDataPath);
  fs.writeFileSync(entryPath, `
    const { app, safeStorage } = require('electron');
    app.setPath('userData', ${JSON.stringify(userDataPath)});
    app.whenReady().then(async () => {
      try {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('legacy safeStorage unavailable');
        const expected = 'natux-safe-storage-interop-fixture';
        const legacyCiphertext = safeStorage.encryptString(expected);
        let decrypted = await safeStorage.decryptStringAsync(legacyCiphertext);
        for (let attempt = 0; decrypted.shouldReEncrypt && attempt < 2; attempt += 1) {
          decrypted = await safeStorage.decryptStringAsync(legacyCiphertext);
        }
        if (decrypted.result !== expected) throw new Error('async API did not recover the legacy value');
        process.stdout.write('NATUX_SAFE_STORAGE_INTEROP_OK\\n');
      } catch (error) {
        process.stderr.write(String(error instanceof Error ? error.message : error));
        process.exitCode = 1;
      } finally {
        app.quit();
      }
    });
  `, 'utf8');

  try {
    const electronPath = legacyRequire('electron');
    assert.equal(typeof electronPath, 'string', 'Electron binary path should be available to Node');
    const childEnvironment = { ...process.env };
    delete childEnvironment.ELECTRON_RUN_AS_NODE;
    const child = spawnSync(electronPath, [entryPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
      env: childEnvironment,
    });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.match(child.stdout, /NATUX_SAFE_STORAGE_INTEROP_OK/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
