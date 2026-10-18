const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');

function within(owner, filename) {
  const relative = path.relative(owner, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeError(error) {
  const clean = (value, limit) => String(value ?? '')
    .replace(/(authorization|password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gi, '$1?[REDACTED]')
    .slice(0, limit);
  return { name: clean(error?.name, 64), code: clean(error?.code, 64),
    message: clean(error?.message, 1024), stack: clean(error?.stack, 4096) };
}

async function probe(action) {
  try { return await action(); } catch (error) { return { error: safeError(error) }; }
}

function portStatus(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(1500, () => finish({ open: false, reason: 'timeout' }));
    socket.once('connect', () => finish({ open: true }));
    socket.once('error', error => finish({ open: false, code: error.code }));
  });
}

async function nativeHash(executable, owner, expected) {
  try {
    const stat = await fs.lstat(executable);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 300 * 1024 * 1024, 'Diagnostic executable must be a bounded regular file.');
    const real = await fs.realpath(executable);
    assert.ok(within(owner, real), 'Diagnostic executable escaped the test owner.');
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(real)) hash.update(chunk);
    const actual = hash.digest('hex');
    return { exists: true, size: stat.size, sha512: actual, expectedSha512: expected, matchesPublished: actual === expected };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, expectedSha512: expected };
    throw error;
  }
}

async function captureUpgradeFailure(input, runFile) {
  const { runtimeDirectory, testRoot, installDirectory, executable, expectedHash, port } = input;
  assert.ok(within(testRoot, installDirectory) && within(installDirectory, executable), 'Diagnostic paths must be owned by this upgrade test.');
  assert.match(expectedHash, /^[0-9a-f]{128}$/);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.equal((await fs.realpath(runtimeDirectory)).toLowerCase(), path.resolve(runtimeDirectory).toLowerCase());
  const owned = installDirectory.replaceAll("'", "''");
  const processInfo = await probe(async () => {
    const { stdout, stderr } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
      $ErrorActionPreference = 'Stop'
      $owner = '${owned}' + [IO.Path]::DirectorySeparatorChar
      $items = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($owner, [StringComparison]::OrdinalIgnoreCase)
      } | Select-Object -First 16 ProcessId, ParentProcessId, ExecutablePath, CreationDate)
      ConvertTo-Json -InputObject $items -Compress
    `], { windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 });
    assert.equal(stderr.trim(), '');
    const items = JSON.parse(stdout);
    assert.ok(Array.isArray(items) && items.length <= 16);
    for (const item of items) assert.ok(within(installDirectory, item.ExecutablePath), 'Diagnostic process escaped the installation.');
    return items;
  });
  const integrity = await probe(async () => {
    const { stdout } = await runFile('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000, maxBuffer: 32 * 1024 });
    return { testProcessSid: /S-1-16-\d+/.exec(stdout)?.[0] ?? null };
  });
  const receipt = { success: false, capturedBeforeCleanup: true, capturedAt: new Date().toISOString(),
    stage: input.stage, previousVersion: input.previousVersion, expectedVersion: input.targetVersion,
    updaterEvents: (input.updaterEvents ?? []).slice(-8).map(event => ({
      type: String(event.type ?? '').slice(0, 40), version: String(event.version ?? '').slice(0, 80),
      message: safeError({ message: event.message }).message.slice(0, 512) })),
    observedVersion: input.observedVersion ?? null, lastConnectError: input.lastConnectError ? safeError(input.lastConnectError) : null,
    error: safeError(input.error), originalChild: input.child ? { pid: input.child.pid, exitCode: input.child.exitCode, signalCode: input.child.signalCode } : null,
    installedExecutable: await probe(() => nativeHash(executable, testRoot, expectedHash)),
    ownedProcesses: processInfo, integrity, debuggerPort: { port, ...await portStatus(port) } };
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  assert.ok(Buffer.byteLength(json) <= 64 * 1024, 'Failure receipt exceeds its size bound.');
  const filename = path.join(runtimeDirectory, 'tauri-upgrade-failure.json');
  await fs.writeFile(filename, json, { flag: 'wx' });
  return filename;
}

module.exports = { captureUpgradeFailure, safeError };
