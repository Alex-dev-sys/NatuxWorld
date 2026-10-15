const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { chromium } = require('playwright-core');

const runFile = promisify(execFile);
const repository = path.resolve(__dirname, '../..');
const VERSION = '1.9.15';
const RELEASE = `https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v${VERSION}/`;
const INSTALLER = `NATUX-WORLD-Setup-${VERSION}-x64.exe`;
const PREFIX = 'natux-electron-migration-test-';
const LEGACY_GUID = 'a4b4c9af-4db5-52ba-94a5-1ac47f40eef5';
const LEGACY_KEY = `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${LEGACY_GUID}`;

function readMigrationConfig(env, username = os.userInfo().username) {
  assert.equal(env.NATUX_TAURI_ELECTRON_MIGRATION_ACCEPTANCE, '1', 'Set migration ACCEPTANCE=1 explicitly.');
  assert.equal(env.NATUX_TAURI_ELECTRON_MIGRATION_DEDICATED_ACCOUNT, 'YES', 'A dedicated test account is required.');
  assert.equal(env.NATUX_TAURI_ELECTRON_MIGRATION_EPHEMERAL_CI, 'YES', 'Confirm a clean ephemeral Windows CI runner.');
  assert.equal(env.CI, 'true', 'Installer migration can run only in CI.');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'This harness requires a GitHub-hosted ephemeral runner.');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'Persistent self-hosted machines are excluded.');
  assert.equal(env.RUNNER_OS, 'Windows', 'A Windows runner is required.');
  assert.equal(env.GITHUB_REPOSITORY, 'Alex-dev-sys/NatuxWorld', 'Use the official repository CI.');
  assert.equal(env.NATUX_TAURI_ELECTRON_MIGRATION_WINDOWS_ACCOUNT?.toLowerCase(), username.toLowerCase(),
    'Configured Windows account must match the current account.');
  for (const name of ['NATUX_TAURI_E2E_INSTALLER', 'NATUX_TAURI_E2E_EXECUTABLE_HASH_FILE']) {
    assert.ok(env[name]?.trim(), `Set ${name} to the current build artifact.`);
  }
  return { installer: env.NATUX_TAURI_E2E_INSTALLER, hashFile: env.NATUX_TAURI_E2E_EXECUTABLE_HASH_FILE };
}

function isWithin(directory, candidate) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertCurrentInstallerName(filename, version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const allowed = [`NATUX WORLD_${version}_x64-setup.exe`, `NatuxWorld-${version}-x64-setup.exe`];
  assert.ok(allowed.some((name) => name.toLowerCase() === path.basename(filename).toLowerCase()),
    'Use exactly the current native-generated or publish-renamed x64 NSIS artifact.');
}

async function ownedFile(filename, owner) {
  const resolved = await fs.realpath(filename);
  assert.ok(isWithin(owner, resolved), 'Executable/artifact must stay within its declared owner directory.');
  assert.ok((await fs.stat(resolved)).isFile());
  return resolved;
}

async function embeddedPublicKey() {
  const source = await fs.readFile(path.join(repository, 'electron/services/UpdateTrust.ts'), 'utf8');
  const match = /UPDATE_SIGNING_PUBLIC_KEY\s*=\s*`(-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----)`/.exec(source);
  assert.ok(match, 'Read the existing embedded update trust key; never accept an environment override.');
  const key = createPublicKey(match[1]);
  assert.equal(key.asymmetricKeyType, 'ed25519');
  return key;
}

function verifyLegacyManifest(raw, rawSignature, key) {
  assert.ok(Buffer.byteLength(raw) <= 16 * 1024, 'Manifest must be bounded.');
  assert.ok(Buffer.byteLength(rawSignature) <= 1024, 'Signature must be bounded.');
  const signature = rawSignature.trim();
  assert.match(signature, /^[A-Za-z0-9+/]{86}==$/);
  assert.ok(verify(null, Buffer.from(raw), key, Buffer.from(signature, 'base64')), 'Legacy manifest signature verification failed.');
  const manifest = JSON.parse(raw);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repository, 'Alex-dev-sys/NatuxWorld');
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.artifact, INSTALLER, 'Only the pinned published NSIS installer is accepted.');
  assert.match(manifest.sha512, /^[A-Za-z0-9+/]{86}==$/);
  if (manifest.executableSha512 !== undefined) assert.match(manifest.executableSha512, /^[A-Za-z0-9+/]{86}==$/);
  return manifest;
}

function allowedDownload(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password
    && (parsed.port === '' || parsed.port === '443')
    && ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname);
}

async function releaseResponse(filename) {
  assert.ok(['natux-update.json', 'natux-update.json.sig', INSTALLER].includes(filename));
  let url = `${RELEASE}${encodeURIComponent(filename)}`;
  for (let redirects = 0; redirects <= 5; redirects++) {
    assert.ok(allowedDownload(url), 'Release download must remain on official GitHub HTTPS hosts.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(180_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      assert.ok(location, 'Redirect must have a destination.');
      await response.body?.cancel();
      url = new URL(location, url).href;
      continue;
    }
    assert.equal(response.status, 200, `Published ${filename} is unavailable (${response.status}).`);
    return response;
  }
  assert.fail('Too many release download redirects.');
}

async function boundedText(filename, maximum) {
  const response = await releaseResponse(filename);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    assert.ok(bytes <= maximum, 'Release metadata exceeds its size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function downloadVerifiedLegacy(owner) {
  const raw = await boundedText('natux-update.json', 16 * 1024);
  const rawSignature = await boundedText('natux-update.json.sig', 1024);
  const manifest = verifyLegacyManifest(raw, rawSignature, await embeddedPublicKey());
  await fs.writeFile(path.join(owner, 'natux-update.json'), raw);
  await fs.writeFile(path.join(owner, 'natux-update.json.sig'), rawSignature);
  const partial = path.join(owner, `${INSTALLER}.partial`);
  const handle = await fs.open(partial, 'wx');
  const hash = createHash('sha512');
  let bytes = 0;
  try {
    const response = await releaseResponse(INSTALLER);
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= 400 * 1024 * 1024, 'Legacy installer exceeds its size limit.');
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
  } finally { await handle.close(); }
  assert.ok(bytes > 0);
  assert.equal(hash.digest('base64'), manifest.sha512, 'Published installer SHA-512 mismatch; execution is forbidden.');
  const installer = path.join(owner, INSTALLER);
  await fs.rename(partial, installer);
  return { installer: await ownedFile(installer, owner), manifest };
}

async function waitFor(check, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

async function files(directory, base = directory) {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Installation must not contain redirected paths.');
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(candidate, base));
    else if (entry.isFile()) found.push(path.relative(base, candidate));
  }
  return found;
}

async function installedFile(directory, expression) {
  const found = (await files(directory)).filter((filename) => expression.test(path.basename(filename)));
  assert.equal(found.length, 1, 'Exactly one expected installed file must exist.');
  return ownedFile(path.join(directory, found[0]), directory);
}

async function registrations() {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
    $items = @($roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | ForEach-Object {
      $r = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      if ($r.DisplayName -and $r.DisplayName.StartsWith('NATUX WORLD', [StringComparison]::OrdinalIgnoreCase)) {
        [pscustomobject]@{ key=$_.Name; version=$r.DisplayVersion; location=$r.InstallLocation; uninstall=$r.UninstallString }
      }
    } })
    ConvertTo-Json -InputObject $items -Compress
  `], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 });
  const entries = JSON.parse(stdout.trim());
  assert.ok(Array.isArray(entries));
  return entries;
}

function legacyUninstallerPath(entry) {
  assert.equal(entry.key?.toLowerCase(), LEGACY_KEY.toLowerCase(), 'Fallback requires the exact published current-user Electron GUID.');
  assert.equal(entry.version, VERSION);
  assert.ok(typeof entry.uninstall === 'string' && entry.uninstall.length <= 16_384
    && !Array.from(entry.uninstall).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
  const match = /^"([^"]+)"(?: \/currentuser)?$/i.exec(entry.uninstall);
  assert.ok(match, 'Legacy uninstaller must be quoted and contain only the known current-user argument.');
  const filename = match[1];
  assert.match(filename, /^[A-Za-z]:[\\/]/, 'Legacy uninstaller must be on a local absolute Windows drive.');
  assert.ok(!filename.split(/[\\/]/).some((segment) => segment === '.' || segment === '..'));
  assert.equal(path.win32.basename(filename).toLowerCase(), 'uninstall natux world.exe');
  return filename;
}

function normalizedInstallationPath(filename) {
  assert.ok(typeof filename === 'string' && filename !== '', 'Installation location is required.');
  return (/^[A-Za-z]:[\\/]/.test(filename) ? path.win32.resolve(filename) : path.resolve(filename)).toLowerCase();
}

function assertOwnedRegistrations(entries, directory, version) {
  assert.equal(entries.length, 1, 'Migration must retire the old registry identity, not leave two installed engines.');
  assert.equal(entries[0].version, version);
  let location = entries[0].location;
  if (!location) {
    assert.equal(version, VERSION, 'Native registration must provide InstallLocation.');
    location = path.win32.dirname(legacyUninstallerPath(entries[0]));
  }
  assert.equal(normalizedInstallationPath(location), normalizedInstallationPath(directory), 'Registration must point to the isolated install.');
}

async function stopProcessList(queryPids, killPid) {
  for (const pid of await queryPids()) {
    assert.match(pid, /^\d+$/);
    // Killing a parent with /T may already remove later descendants in the
    // snapshot. Re-check ownership/existence before each individual kill.
    if (!(await queryPids()).includes(pid)) continue;
    try { await killPid(pid); }
    catch (error) { if ((await queryPids()).includes(pid)) throw error; }
  }
  await waitFor(async () => (await queryPids()).length === 0, 10_000, 'Isolated installed process did not stop.');
}

async function stopExecutable(executable, owner) {
  assert.ok(isWithin(owner, executable));
  const literal = executable.replaceAll("'", "''");
  const query = `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${literal}' } | Select-Object -ExpandProperty ProcessId)`;
  const queryPids = async () => {
    const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, timeout: 15_000 });
    return stdout.trim().split(/\s+/).filter(Boolean);
  };
  await stopProcessList(queryPids, (pid) => runFile('taskkill.exe', ['/PID', pid, '/T', '/F'], { windowsHide: true, timeout: 15_000 }));
}

async function launch(executable, environment, profile, engine, version, owner) {
  await ownedFile(executable, owner);
  assert.ok(isWithin(owner, profile));
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const env = { ...environment };
  const args = engine === 'electron' ? [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] : [];
  if (engine === 'tauri') env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
  const child = spawn(executable, args, { env, cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore' });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  const connected = await waitFor(async () => {
    if (spawnError) throw spawnError;
    assert.equal(child.exitCode, null, `${engine} exited before initialization.`);
    let browser;
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      const page = browser.contexts().flatMap((context) => context.pages())[0];
      const actual = page && await page.evaluate((kind) => kind === 'electron'
        ? window.natux?.getVersion() : window.__TAURI_INTERNALS__?.invoke('get_version'), engine);
      if (actual === version) {
        if (engine === 'electron') {
          const cdp = await browser.newBrowserCDPSession();
          const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
          assert.ok(processInfo.some((item) => item.type === 'browser' && Number(item.id) === child.pid));
          await cdp.detach();
        }
        return { browser, page, child };
      }
    } catch { /* WebView and preload may still be initializing. */ }
    await browser?.close().catch(() => {});
    return false;
  }, 60_000, `Installed ${engine} did not expose expected version ${version}.`);
  return connected;
}

module.exports = { VERSION, PREFIX, RELEASE, LEGACY_GUID, legacyUninstallerPath, readMigrationConfig, isWithin, assertCurrentInstallerName, ownedFile, embeddedPublicKey,
  verifyLegacyManifest, allowedDownload, downloadVerifiedLegacy, runFile, files, installedFile,
  registrations, assertOwnedRegistrations, waitFor, stopProcessList, stopExecutable, launch };
