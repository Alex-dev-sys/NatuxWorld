import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { clearTimeout, setTimeout } from 'node:timers';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const posix = path.posix;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const credentialTest = 'account::transport::system_credential_tests::system_credential_store_roundtrips_across_processes';
const ownerPrefix = 'natux-macos-credentials-';

export function validateRunner(env, facts) {
  const required = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'macOS', GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_JOB: 'macos_acceptance',
    NATUX_MACOS_CREDENTIAL_ACCEPTANCE: '1', USER: 'runner' };
  for (const [key, value] of Object.entries(required)) {
    if (env[key] !== value) throw new Error(`Disposable macOS credential acceptance requires ${key}=${value}.`);
  }
  if (facts.platform !== 'darwin' || facts.username !== 'runner' || !(facts.uid > 0)) {
    throw new Error('Credential acceptance requires the actual unprivileged hosted macOS runner account.');
  }
  const target = { x64: ['X64', 'x86_64', 'x86_64-apple-darwin'],
    arm64: ['ARM64', 'aarch64', 'aarch64-apple-darwin'] }[facts.arch];
  if (!target || env.RUNNER_ARCH !== target[0] || env.NATUX_MACOS_CREDENTIAL_EXPECTED_ARCH !== target[1]) {
    throw new Error('Credential acceptance must execute on the explicitly selected native architecture.');
  }
  if (!env.RUNNER_NAME?.trim() || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[0-9a-f]{40}$/i.test(env.GITHUB_SHA ?? '')
    || !['push', 'pull_request', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Official disposable GitHub runner metadata is required.');
  }
  if (!posix.isAbsolute(facts.homedir) || !posix.isAbsolute(env.RUNNER_TEMP ?? '')
    || posix.dirname(env.RUNNER_TEMP) !== posix.join(facts.homedir, 'work')
    || posix.basename(env.RUNNER_TEMP) !== '_temp' || !posix.isAbsolute(env.GITHUB_WORKSPACE ?? '')) {
    throw new Error('Use the hosted runner workspace and its owned work/_temp directory.');
  }
  return { target: target[2], arch: target[1] };
}

export function parseKeychainMetadata(output, single = false) {
  if (Buffer.byteLength(output) > 131_072) throw new Error('Keychain metadata exceeds its limit.');
  const paths = output.split(/\r?\n/).filter(line => line.trim()).map(line => {
    let filename;
    try { filename = JSON.parse(line.trim()); } catch { throw new Error('Unsupported keychain path metadata.'); }
    if (typeof filename !== 'string' || !posix.isAbsolute(filename) || filename.length > 4096
      || [...filename].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      throw new Error('Unsafe keychain path metadata.');
    }
    return filename;
  });
  if (!paths.length || paths.length > 32 || (single && paths.length !== 1)
    || new Set(paths).size !== paths.length) throw new Error('Ambiguous keychain metadata.');
  return paths;
}

export function selectTestExecutable(output, repository, target) {
  const executables = new Set();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    let item;
    try { item = JSON.parse(line); } catch { throw new Error('Cargo must return JSON artifact metadata.'); }
    if (item.reason === 'compiler-artifact' && item.profile?.test === true
      && item.target?.name === 'natux_world_launcher_native' && item.target.kind?.includes('lib') && item.executable) {
      executables.add(item.executable);
    }
  }
  if (executables.size !== 1) throw new Error('Expected exactly one native launcher lib test binary.');
  const [executable] = executables;
  const deps = posix.join(repository, 'src/native/target', target, 'debug/deps');
  if (posix.dirname(executable) !== deps
    || !/^natux_world_launcher_native-[0-9a-f]+$/.test(posix.basename(executable))) {
    throw new Error('Cargo test executable must be the owned native target artifact.');
  }
  return executable;
}

export function verifyRoundtripOutput(output) {
  if (!/^running 1 test\s*$/m.test(output)
    || !/^test result: ok\. 1 passed; 0 failed; 0 ignored;/m.test(output)
    || !output.includes(`test ${credentialTest} ... ok`)) {
    throw new Error('The native credential round-trip must actually run exactly one passing test.');
  }
}

class AcceptanceCommandError extends Error {}

export function commandFailureMessage(file, label, { code, signal, failure, stdout, stderr, diagnostics }) {
  const exit = Number.isInteger(code) ? `exit ${code}` : `exit unavailable${signal ? `; signal ${signal}` : ''}`;
  const message = `${label} ${failure ?? 'failed'} (${exit}).`;
  // Only Cargo/libtest diagnostics are enabled by their fixed call sites. Never
  // expose security stdout, stderr or arguments, which may contain the password.
  if (!diagnostics || file === '/usr/bin/security') return message;
  const output = [stdout, stderr].filter(Boolean).join('\n').slice(-65_536);
  return output ? `${message}\n${output}` : message;
}

// Each child owns a process group, including Rust fixture descendants. A hard
// deadline kills that entire group before finally restores keychain metadata.
export function runAcceptanceCommand(file, args, { cwd, env, label, diagnostics = false,
  timeout = 30_000, maxBytes = 16 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(file, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reject(new AcceptanceCommandError(`${label} could not start (exit unavailable).`)); return; }
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let failure;
    const stop = reason => {
      failure ??= reason;
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group may already have exited */ }
      }
    };
    const timer = setTimeout(() => stop('timed out'), timeout);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop('exceeded its output limit'); else stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop('exceeded its output limit');
      else if (diagnostics && file !== '/usr/bin/security') stderr += chunk.toString();
    });
    child.on('error', () => { failure ??= 'could not start'; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(new AcceptanceCommandError(commandFailureMessage(file, label,
        { code, signal, failure, stdout, stderr, diagnostics })));
      else resolve(stdout);
    });
  });
}

async function assertOwner(io, owner, runnerTemp) {
  const info = await io.lstat(owner);
  if (!info.isDirectory() || info.isSymbolicLink() || await io.realpath(owner) !== owner
    || posix.dirname(owner) !== runnerTemp || !posix.basename(owner).startsWith(ownerPrefix)) {
    throw new Error('Temporary credential keychain owner escaped its runner directory.');
  }
}

async function fileExists(io, filename) {
  try { await io.lstat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function withOwnedKeychain({ io, run, repository, env, runnerTemp, executable, arch, write }) {
  const security = (args, label) => run('/usr/bin/security', args,
    { cwd: repository, env, label, timeout: 15_000, maxBytes: 131_072 });
  const originalDefault = parseKeychainMetadata(await security(['default-keychain', '-d', 'user'], 'Read default keychain metadata'), true);
  const originalSearch = parseKeychainMetadata(await security(['list-keychains', '-d', 'user'], 'Read keychain search metadata'));
  const owner = await io.realpath(await io.mkdtemp(posix.join(runnerTemp, ownerPrefix)));
  await assertOwner(io, owner, runnerTemp);
  const keychain = posix.join(owner, 'fixture.keychain-db');
  const password = randomBytes(32).toString('base64url');
  let touchedMetadata = false;
  let stage = 'create fixture';
  let failed = false;
  let restored = false;
  let cleanupFailed = false;
  let output;
  let failureDetail = '';
  const cleanupDetails = [];
  try {
    touchedMetadata = true; // create-keychain itself may alter search metadata.
    await security(['create-keychain', '-p', password, keychain], 'Create owned keychain');
    const entry = await io.lstat(keychain);
    if (!entry.isFile() || entry.isSymbolicLink() || await io.realpath(keychain) !== keychain) {
      throw new Error('Fixture keychain must be the owned regular file.');
    }
    stage = 'prepare fixture';
    await security(['set-keychain-settings', '-lut', '600', keychain], 'Set owned keychain timeout');
    await security(['unlock-keychain', '-p', password, keychain], 'Unlock owned keychain');
    await security(['list-keychains', '-d', 'user', '-s', keychain], 'Select owned keychain search list');
    await security(['default-keychain', '-d', 'user', '-s', keychain], 'Select owned default keychain');
    stage = 'verify fixture selection';
    for (const operation of ['default-keychain', 'list-keychains']) {
      const selected = parseKeychainMetadata(await security([operation, '-d', 'user'], 'Verify owned keychain metadata'), true);
      if (await io.realpath(selected[0]) !== keychain) throw new Error('Owned keychain selection failed.');
    }
    stage = 'execute native round-trip';
    output = await run(executable, ['--exact', credentialTest, '--ignored', '--nocapture', '--test-threads=1'],
      { cwd: repository, env: { ...env, NATUX_MACOS_CREDENTIAL_KEYCHAIN: keychain },
        label: 'Native credential round-trip', diagnostics: true, timeout: 90_000, maxBytes: 1024 * 1024 });
    verifyRoundtripOutput(output);
  } catch (error) {
    failed = true;
    if (error instanceof AcceptanceCommandError) failureDetail = `\n${error.message}`;
  } finally {
    if (touchedMetadata) {
      // Restore both independent pieces even if one command fails; then verify
      // metadata without ever querying any existing keychain's entries.
      for (const args of [['default-keychain', '-d', 'user', '-s', originalDefault[0]],
        ['list-keychains', '-d', 'user', '-s', ...originalSearch]]) {
        try { await security(args, 'Restore original keychain metadata'); }
        catch (error) {
          cleanupFailed = true;
          if (error instanceof AcceptanceCommandError) cleanupDetails.push(error.message);
        }
      }
      try {
        const actualDefault = parseKeychainMetadata(await security(['default-keychain', '-d', 'user'], 'Verify restored default keychain'), true);
        const actualSearch = parseKeychainMetadata(await security(['list-keychains', '-d', 'user'], 'Verify restored keychain search list'));
        restored = JSON.stringify(actualDefault) === JSON.stringify(originalDefault)
          && JSON.stringify(actualSearch) === JSON.stringify(originalSearch);
      } catch (error) {
        cleanupFailed = true;
        if (error instanceof AcceptanceCommandError) cleanupDetails.push(error.message);
      }
    }
    if (restored || !touchedMetadata) {
      try {
        await assertOwner(io, owner, runnerTemp);
        if (await fileExists(io, keychain)) {
          try { await security(['delete-keychain', keychain], 'Delete owned keychain'); }
          catch (error) {
            cleanupFailed = true;
            if (error instanceof AcceptanceCommandError) cleanupDetails.push(error.message);
          }
        }
        await io.rm(owner, { recursive: true, force: true });
      } catch { cleanupFailed = true; }
    } else {
      cleanupFailed = true; // Never delete a file while it could remain the default.
    }
  }
  if (cleanupFailed || !restored) throw new Error(`Credential acceptance could not restore keychain metadata and clean its owned fixture.${failureDetail}${cleanupDetails.length ? `\n${cleanupDetails.join('\n')}` : ''}`);
  if (failed) throw new Error(`Credential acceptance failed during ${stage}; original keychain metadata was restored.${failureDetail}`);
  write(output);
  write(`Native ${arch} credential acceptance: original keychain metadata restored; owned temporary keychain removed.\n`);
}

async function prepareReceipt(io, repository) {
  const tests = posix.join(repository, 'tests');
  const runtime = posix.join(tests, '.runtime');
  const testsInfo = await io.lstat(tests);
  if (!testsInfo.isDirectory() || testsInfo.isSymbolicLink() || await io.realpath(tests) !== tests) {
    throw new Error('Credential receipt must remain in the checkout tests directory.');
  }
  await io.mkdir(runtime, { recursive: true });
  const runtimeInfo = await io.lstat(runtime);
  if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink() || await io.realpath(runtime) !== runtime) {
    throw new Error('Credential receipt runtime directory must be owned by the checkout.');
  }
  const filename = posix.join(runtime, 'macos-credential-result.json');
  if (await fileExists(io, filename)) {
    const info = await io.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || await io.realpath(filename) !== filename) {
      throw new Error('Refusing an unsafe existing credential receipt.');
    }
    await io.rm(filename);
  }
  return filename;
}

async function writeReceipt(io, filename, receipt) {
  const pending = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
  let published = false;
  try {
    await io.writeFile(pending, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await io.rename(pending, filename);
    published = true;
  } finally {
    if (!published) await io.rm(pending, { force: true });
  }
}

export async function runMacosCredentialAcceptance(options = {}) {
  const env = { ...(options.env ?? process.env) };
  const facts = options.facts ?? { platform: process.platform, arch: process.arch,
    username: os.userInfo().username, homedir: os.userInfo().homedir, uid: process.getuid?.() };
  const config = validateRunner(env, facts); // No filesystem/security activity before this guard.
  const io = options.io ?? fs;
  const run = options.run ?? runAcceptanceCommand;
  const repository = await io.realpath(options.repository ?? root);
  const workspace = await io.realpath(env.GITHUB_WORKSPACE);
  const runnerTemp = await io.realpath(env.RUNNER_TEMP);
  if (workspace !== repository || runnerTemp !== env.RUNNER_TEMP
    || (await io.lstat(runnerTemp)).uid !== facts.uid) throw new Error('Use the exact checkout and owned runner temp directory.');
  const receiptPath = await prepareReceipt(io, repository);
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_SYSTEM_CREDENTIAL_FIXTURE_') || key === 'NATUX_MACOS_CREDENTIAL_KEYCHAIN'
      || key === 'CARGO_TARGET_DIR' || key === 'CARGO_BUILD_TARGET') delete env[key];
  }
  const artifacts = await run('cargo', ['test', '--manifest-path', posix.join(repository, 'src/native/Cargo.toml'),
    '--locked', '--lib', '--target', config.target, '--no-run', '--message-format=json'],
  { cwd: repository, env, label: 'Compile native credential acceptance', diagnostics: true,
    timeout: 1_200_000, maxBytes: 32 * 1024 * 1024 });
  const executable = selectTestExecutable(artifacts, repository, config.target);
  const stat = await io.lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink() || await io.realpath(executable) !== executable) {
    throw new Error('The native credential test must be a regular owned executable.');
  }
  const list = await run(executable, ['--list', '--format', 'terse'],
    { cwd: repository, env, label: 'List native credential tests', diagnostics: true, timeout: 30_000 });
  if (list.split(/\r?\n/).filter(line => line === `${credentialTest}: test`).length !== 1) {
    throw new Error('The native test binary must contain exactly the expected credential fixture.');
  }
  await withOwnedKeychain({ io, run, repository, env, runnerTemp, executable, arch: config.arch,
    write: options.write ?? (value => process.stdout.write(value)) });
  await writeReceipt(io, receiptPath, { source: env.GITHUB_SHA.toLowerCase(), nativeArch: config.arch,
    target: config.target, provider: 'macOS Keychain / SystemCredentialStore', test: credentialTest, count: 1,
    cleanup: { defaultKeychainRestored: true, searchListRestored: true,
      ownedKeychainRemoved: true, ownedDirectoryRemoved: true } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Credential acceptance does not accept arbitrary commands or arguments.');
  await runMacosCredentialAcceptance().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
