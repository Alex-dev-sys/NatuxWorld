import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { commandFailureMessage, credentialTest, parseKeychainMetadata, runAcceptanceCommand, runMacosCredentialAcceptance,
  selectTestExecutable, validateRunner, verifyRoundtripOutput } from '../../scripts/run-macos-credential-acceptance.mjs';

const repository = '/Users/runner/work/NatuxWorld/NatuxWorld';
const runnerTemp = '/Users/runner/work/_temp';
const owner = `${runnerTemp}/natux-macos-credentials-ABCDEF`;
const keychain = `${owner}/fixture.keychain-db`;
const login = '/Users/runner/Library/Keychains/login.keychain-db';
const system = '/Library/Keychains/System.keychain';
const runtime = `${repository}/tests/.runtime`;
const receiptPath = `${runtime}/macos-credential-result.json`;
const facts = { platform: 'darwin', arch: 'arm64', username: 'runner', homedir: '/Users/runner', uid: 501 };
const environment = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_OS: 'macOS', RUNNER_ARCH: 'ARM64', GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld',
  GITHUB_JOB: 'macos_acceptance', GITHUB_RUN_ID: '123456', GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
  RUNNER_NAME: 'GitHub Actions 12', USER: 'runner', RUNNER_TEMP: runnerTemp, GITHUB_WORKSPACE: repository,
  NATUX_MACOS_CREDENTIAL_ACCEPTANCE: '1', NATUX_MACOS_CREDENTIAL_EXPECTED_ARCH: 'aarch64' };
const passed = `\nrunning 1 test\ntest ${credentialTest} ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 123 filtered out; finished in 0.10s\n`;

function simulation(options = {}) {
  const config = validateRunner(options.env ?? environment, options.facts ?? facts);
  const executable = `${repository}/src/native/target/${config.target}/debug/deps/natux_world_launcher_native-ab12cd34`;
  const state = { default: login, search: [login, system], created: false, removed: false,
    deleted: [], commands: [], output: [], failed: false, receipt: options.staleReceipt ? 'stale receipt' : undefined,
    pending: new Map(), receiptWrites: 0 };
  const io = {
    realpath: async filename => filename,
    mkdtemp: async prefix => { assert.equal(prefix, `${runnerTemp}/natux-macos-credentials-`); return owner; },
    lstat: async filename => {
      if ((filename === keychain && !state.created) || (filename === receiptPath && state.receipt === undefined)) {
        throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      }
      return { uid: 501, isFile: () => [keychain, executable, receiptPath].includes(filename),
        isDirectory: () => [owner, runnerTemp, `${repository}/tests`, runtime].includes(filename), isSymbolicLink: () => false };
    },
    mkdir: async (filename, settings) => {
      assert.equal(filename, runtime);
      assert.deepEqual(settings, { recursive: true });
    },
    rm: async (filename, settings) => {
      if (filename === owner) {
        assert.deepEqual(settings, { recursive: true, force: true });
        if (options.ownerCleanupFailure) throw new Error('owned directory removal failed');
        state.removed = true;
      } else if (filename === receiptPath) {
        state.receipt = undefined;
      } else {
        assert.match(filename, /^.+\/macos-credential-result\.json\.[0-9a-f]{16}\.tmp$/);
        assert.deepEqual(settings, { force: true });
        state.pending.delete(filename);
      }
    },
    writeFile: async (filename, value, settings) => {
      assert.equal(state.removed, true, 'receipt cannot be prepared before owned directory removal');
      assert.equal(state.default, login);
      assert.deepEqual(state.search, [login, system]);
      assert.deepEqual(settings, { flag: 'wx', mode: 0o600 });
      state.receiptWrites += 1;
      state.pending.set(filename, value);
      if (options.receiptFailure) throw new Error('receipt write failed');
    },
    rename: async (from, to) => {
      assert.equal(to, receiptPath);
      assert.ok(state.pending.has(from));
      if (options.receiptRenameFailure) throw new Error('receipt rename failed');
      state.receipt = state.pending.get(from);
      state.pending.delete(from);
    },
  };
  const run = async (file, args, settings) => {
    state.commands.push({ file, args, settings });
    if (file === 'cargo') {
      assert.equal(settings.timeout, 1_200_000);
      assert.equal(settings.diagnostics, true);
      assert.deepEqual(args, ['test', '--manifest-path', `${repository}/src/native/Cargo.toml`, '--locked', '--lib',
        '--target', config.target, '--no-run', '--message-format=json']);
      if (options.compileFailure) throw new Error('safe compilation failure');
      return JSON.stringify({ reason: 'compiler-artifact', profile: { test: true },
        target: { name: 'natux_world_launcher_native', kind: ['lib'] }, executable: options.badArtifact ?? executable });
    }
    if (file === executable) {
      if (args[0] === '--list') return options.missingTest ? '' : `${credentialTest}: test\n`;
      assert.deepEqual(args, ['--exact', credentialTest, '--ignored', '--nocapture', '--test-threads=1']);
      assert.equal(settings.env.NATUX_MACOS_CREDENTIAL_KEYCHAIN, keychain);
      assert.equal(settings.timeout, 90_000);
      assert.equal(settings.diagnostics, true);
      assert.equal(state.default, keychain);
      assert.deepEqual(state.search, [keychain]);
      if (options.testFailure) throw options.testFailure instanceof Error ? options.testFailure : new Error('simulated native failure');
      return options.testOutput ?? passed;
    }
    assert.equal(file, '/usr/bin/security');
    assert.ok(['default-keychain', 'list-keychains', 'create-keychain', 'unlock-keychain',
      'set-keychain-settings', 'delete-keychain'].includes(args[0]), 'entry data must never be queried');
    if (options.failOperation === args[0] && !state.failed) {
      state.failed = true;
      throw new Error(`fake security error could contain password ${args[2]}`);
    }
    if (options.restoreFailure && args[0] === 'default-keychain' && args[3] === '-s' && args[4] === login) {
      throw new Error('restoration rejected');
    }
    switch (args[0]) {
      case 'create-keychain':
        assert.equal(args[1], '-p');
        assert.ok(args[2].length >= 40);
        assert.equal(args[3], keychain);
        state.created = true;
        state.search.push(keychain);
        return '';
      case 'default-keychain':
        if (args[3] === '-s') { state.default = args[4]; return ''; }
        return JSON.stringify(state.default);
      case 'list-keychains':
        if (args[3] === '-s') { state.search = args.slice(4); return ''; }
        return state.search.map(value => `    ${JSON.stringify(value)}`).join('\n');
      case 'delete-keychain':
        assert.equal(args[1], keychain);
        state.deleted.push(keychain);
        state.created = false;
        return '';
      default: return '';
    }
  };
  return { state, executable, options: { io, run, repository, facts: options.facts ?? facts,
    env: options.env ?? environment, write: value => state.output.push(value) } };
}

test('the runner guard accepts actual native Intel and ARM metadata only', () => {
  assert.equal(validateRunner(environment, facts).target, 'aarch64-apple-darwin');
  assert.equal(validateRunner({ ...environment, RUNNER_ARCH: 'X64', NATUX_MACOS_CREDENTIAL_EXPECTED_ARCH: 'x86_64' },
    { ...facts, arch: 'x64' }).target, 'x86_64-apple-darwin');
  for (const [key, value] of [['GITHUB_ACTIONS', 'false'], ['RUNNER_ENVIRONMENT', 'self-hosted'],
    ['RUNNER_OS', 'Windows'], ['RUNNER_ARCH', 'X64'], ['GITHUB_REPOSITORY', 'unrelated/repo'],
    ['GITHUB_JOB', 'macos'], ['USER', 'ordinary-user'], ['NATUX_MACOS_CREDENTIAL_ACCEPTANCE', ''],
    ['NATUX_MACOS_CREDENTIAL_EXPECTED_ARCH', 'x86_64'], ['GITHUB_RUN_ID', ''], ['GITHUB_SHA', 'short-sha'],
    ['RUNNER_TEMP', '/Users/ordinary/work/_temp']]) {
    assert.throws(() => validateRunner({ ...environment, [key]: value }, facts), key);
  }
  for (const changed of [{ platform: 'win32' }, { username: 'ordinary-user' }, { uid: 0 }, { arch: 'ia32' }]) {
    assert.throws(() => validateRunner(environment, { ...facts, ...changed }));
  }
});

test('local invocation is rejected before filesystem access, compilation or security commands', async () => {
  const fail = () => { throw new Error('guard allowed side effects'); };
  await assert.rejects(runMacosCredentialAcceptance({ env: {}, facts, io: { realpath: fail }, run: fail }), /requires/);
});

test('metadata parser handles only bounded unambiguous path metadata', () => {
  assert.deepEqual(parseKeychainMetadata(`    ${JSON.stringify(login)}\n${JSON.stringify(system)}\n`), [login, system]);
  for (const output of ['', 'not quoted', '"relative.keychain"', '"/tmp/key\\nchain"', `${JSON.stringify(login)}\n${JSON.stringify(login)}`]) {
    assert.throws(() => parseKeychainMetadata(output));
  }
  assert.throws(() => parseKeychainMetadata(`${JSON.stringify(login)}\n${JSON.stringify(system)}`, true));
});

test('Cargo metadata selects only the exact native launcher lib test artifact', () => {
  const { executable } = simulation();
  const artifact = { reason: 'compiler-artifact', profile: { test: true },
    target: { name: 'natux_world_launcher_native', kind: ['lib'] }, executable };
  assert.equal(selectTestExecutable(JSON.stringify(artifact), repository, 'aarch64-apple-darwin'), executable);
  for (const changed of [{ executable: '/tmp/arbitrary-code' }, { profile: { test: false } },
    { target: { name: 'different', kind: ['lib'] } }, { executable: executable.replace('aarch64', 'x86_64') }]) {
    assert.throws(() => selectTestExecutable(JSON.stringify({ ...artifact, ...changed }), repository, 'aarch64-apple-darwin'));
  }
  assert.throws(() => selectTestExecutable('not JSON', repository, 'aarch64-apple-darwin'));
});

test('zero tests and ignored tests cannot masquerade as completed provider acceptance', () => {
  verifyRoundtripOutput(passed);
  for (const output of ['running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored;',
    `running 1 test\ntest ${credentialTest} ... ignored\ntest result: ok. 0 passed; 0 failed; 1 ignored;`,
    passed.replace(credentialTest, 'unrelated_test')]) assert.throws(() => verifyRoundtripOutput(output));
});

test('successful acceptance compiles before selection, restores metadata and deletes only its own keychain', async () => {
  const fake = simulation({ env: { ...environment, NATUX_SYSTEM_CREDENTIAL_FIXTURE_SERVICE: 'world.natux.launcher',
    CARGO_TARGET_DIR: '/unrelated', CARGO_BUILD_TARGET: 'x86_64-apple-darwin' } });
  await runMacosCredentialAcceptance(fake.options);
  const { state } = fake;
  assert.equal(state.commands[0].file, 'cargo');
  assert.equal(state.commands[1].file, fake.executable);
  assert.ok(state.commands.every(({ settings }) => !('NATUX_SYSTEM_CREDENTIAL_FIXTURE_SERVICE' in settings.env)
    && !('CARGO_TARGET_DIR' in settings.env) && !('CARGO_BUILD_TARGET' in settings.env)));
  assert.equal(state.default, login);
  assert.deepEqual(state.search, [login, system]);
  assert.deepEqual(state.deleted, [keychain]);
  assert.equal(state.removed, true);
  assert.equal(state.output[0], passed);
  assert.match(state.output[1], /aarch64.*restored.*removed/);
  assert.deepEqual(JSON.parse(state.receipt), { source: environment.GITHUB_SHA, nativeArch: 'aarch64',
    target: 'aarch64-apple-darwin', provider: 'macOS Keychain / SystemCredentialStore', test: credentialTest, count: 1,
    cleanup: { defaultKeychainRestored: true, searchListRestored: true, ownedKeychainRemoved: true, ownedDirectoryRemoved: true } });
  assert.equal(state.pending.size, 0);
  const password = state.commands.find(({ args }) => args[0] === 'create-keychain').args[2];
  assert.ok(!state.receipt.includes(password));
  assert.ok(!state.receipt.includes('temporary-credential-fixture'));
});

test('bad artifacts and missing fixtures fail before any keychain metadata or mutation', async () => {
  for (const changed of [{ badArtifact: '/tmp/arbitrary' }, { missingTest: true }]) {
    const fake = simulation(changed);
    await assert.rejects(runMacosCredentialAcceptance(fake.options));
    assert.ok(fake.state.commands.every(({ file }) => file !== '/usr/bin/security'));
    assert.equal(fake.state.receipt, undefined);
    assert.equal(fake.state.receiptWrites, 0);
  }
});

test('fixture and test failures restore metadata, clean only owned files and never relay a security password', async () => {
  for (const changed of [{ failOperation: 'set-keychain-settings' }, { failOperation: 'unlock-keychain' },
    { failOperation: 'create-keychain' }, { testFailure: true }, { testOutput: 'running 0 tests' }]) {
    const fake = simulation(changed);
    const error = await runMacosCredentialAcceptance(fake.options).then(() => undefined, value => value);
    assert.match(error.message, /failed during/);
    const create = fake.state.commands.find(({ args }) => args[0] === 'create-keychain');
    assert.ok(!error.message.includes(create.args[2]), 'ephemeral password must not enter Error.message');
    assert.equal(fake.state.default, login);
    assert.deepEqual(fake.state.search, [login, system]);
    assert.equal(fake.state.removed, true);
    assert.ok(fake.state.deleted.every(filename => filename === keychain));
    assert.deepEqual(fake.state.output, []);
    assert.equal(fake.state.receipt, undefined);
    assert.equal(fake.state.receiptWrites, 0);
  }
});

test('restoration attempts both metadata operations and never deletes a still-selected keychain', async () => {
  const fake = simulation({ restoreFailure: true });
  await assert.rejects(runMacosCredentialAcceptance(fake.options), /could not restore/);
  assert.equal(fake.state.default, keychain);
  assert.deepEqual(fake.state.search, [login, system]);
  assert.deepEqual(fake.state.deleted, []);
  assert.equal(fake.state.removed, false);
  assert.deepEqual(fake.state.output, []);
  assert.equal(fake.state.receipt, undefined);
  assert.equal(fake.state.receiptWrites, 0);
});

test('failure diagnostics contain bounded Cargo/libtest output and exit codes while security stays secret-safe', async () => {
  const failure = await runAcceptanceCommand(process.execPath,
    ['-e', 'process.stdout.write("fixture assertion context"); process.stderr.write("provider unavailable"); process.exitCode = 7'],
    { env: process.env, label: 'Native credential round-trip', diagnostics: true }).catch(error => error);
  assert.match(failure.message, /exit 7/);
  assert.match(failure.message, /fixture assertion context/);
  assert.match(failure.message, /provider unavailable/);
  const fake = simulation({ testFailure: failure });
  await assert.rejects(runMacosCredentialAcceptance(fake.options), /provider unavailable/);
  assert.equal(fake.state.removed, true);
  assert.equal(fake.state.receiptWrites, 0);
  const detail = { code: 12, stdout: 'ephemeral-password-in-stdout', stderr: 'ephemeral-password-in-stderr', diagnostics: true };
  const safe = commandFailureMessage('/usr/bin/security', 'Unlock owned keychain', detail);
  assert.match(safe, /exit 12/);
  assert.ok(!safe.includes('ephemeral-password'));
  assert.ok(commandFailureMessage('cargo', 'Compile fixture', { ...detail, stderr: 'x'.repeat(100_000) }).length < 66_000);
});

test('stale receipts are removed before compilation and failures never publish a replacement', async () => {
  for (const changed of [{ compileFailure: true }, { missingTest: true }, { testFailure: true },
    { restoreFailure: true }, { failOperation: 'delete-keychain' }, { ownerCleanupFailure: true },
    { receiptFailure: true }, { receiptRenameFailure: true }]) {
    const fake = simulation({ staleReceipt: true, ...changed });
    await assert.rejects(runMacosCredentialAcceptance(fake.options));
    assert.equal(fake.state.receipt, undefined);
    assert.equal(fake.state.pending.size, 0);
  }
});
