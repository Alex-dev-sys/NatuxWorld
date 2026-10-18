import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(await readFile(path.join(repository, '.github/workflows/build.yml'), 'utf8'));
const plan = workflow.jobs.plan.steps.find(step => step.name === 'Determine release state');
assert.equal(plan.shell, 'pwsh');
const version = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8')).version;
const quote = value => `'${value.replaceAll("'", "''")}'`;
function shellEnvironment() {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const bashAvailable = spawnSync(bash, ['--noprofile', '--norc', '-c', 'exit 0'],
  { env: shellEnvironment(), windowsHide: true, timeout: 5000 }).status === 0;

function completeAssets() {
  const required = [...plan.run.matchAll(/\$required\s*\+?=\s*@\(([\s\S]*?)\)/g)]
    .flatMap(match => [...match[1].matchAll(/^\s*['"]([^'"\r\n]+)['"],?\s*$/gm)]
      .map(entry => entry[1].replaceAll('$version', version)));
  assert.ok(required.includes(`NatuxWorld-${version}-x64-setup.exe`));
  assert.ok(required.includes(`NatuxWorld-${version}-x64-portable.zip`));
  assert.ok(required.includes(`NatuxWorld-${version}-aarch64.dmg`));
  return [...new Set([...required, `NATUX-WORLD-${version}-rollback.exe`, 'rollback.exe.blockmap',
    'executable-sha512-windows-x86_64.txt', 'executable-sha512-darwin-x86_64.txt',
    'executable-sha512-darwin-aarch64.txt'])].map(name => ({ name }));
}

async function assertCanonicalDirectory(directory) {
  assert.equal((await realpath(directory)).toLowerCase(), directory.toLowerCase(), 'Fixture cannot traverse a junction.');
  for (let current = directory; ; current = path.dirname(current)) {
    const stat = await lstat(current);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Fixture ancestors must be real directories.');
    if (path.dirname(current) === current) break;
  }
}

async function runPlan({ event = 'workflow_dispatch', draft = false, absent = false, incomplete = false, missingAsset } = {}) {
  const runtime = path.join(repository, 'tests/.runtime');
  await mkdir(runtime, { recursive: true });
  await assertCanonicalDirectory(runtime);
  const owner = await mkdtemp(path.join(runtime, 'release-immutability-'));
  await assertCanonicalDirectory(owner);
  try {
    const fixture = path.join(owner, 'release.json');
    const output = path.join(owner, 'github-output.txt');
    const calls = path.join(owner, 'gh-calls.txt');
    const assets = incomplete ? [] : completeAssets().filter(asset => asset.name !== missingAsset);
    await writeFile(fixture, JSON.stringify({ isDraft: draft, assets }), { flag: 'wx' });
    const script = path.join(owner, 'plan.ps1');
    await writeFile(script, `
$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
function global:gh {
  $expected = @('release', 'view', 'v${version}', '--json', 'isDraft,assets')
  if ($args.Count -ne $expected.Count) { throw 'Fake gh refuses unexpected arguments.' }
  for ($i = 0; $i -lt $expected.Count; $i++) {
    # PowerShell functions receive the unquoted isDraft,assets token as an array.
    $actual = if ($args[$i] -is [array]) { $args[$i] -join ',' } else { [string]$args[$i] }
    if ($actual -cne $expected[$i]) { throw 'Fake gh permits only the exact read-only release view.' }
  }
  [IO.File]::AppendAllText(${quote(calls)}, "view\n")
  if ($env:NATUX_RELEASE_FIXTURE_ABSENT -eq 'true') { $global:LASTEXITCODE = 1; return }
  $global:LASTEXITCODE = 0
  Get-Content -LiteralPath ${quote(fixture)} -Raw
}
if ((Get-Command gh).CommandType -ne 'Function') { throw 'Network CLI was not replaced.' }
${plan.run}
# Match the GitHub Actions pwsh wrapper, including its native exit-code check.
if (Test-Path -LiteralPath variable:LASTEXITCODE) { exit $LASTEXITCODE }
`, { flag: 'wx' });
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (/SIGNING|CSC_|APPLE_|GH_TOKEN|GITHUB_TOKEN/i.test(name)) delete env[name];
    }
    for (const name of Object.keys(plan.env)) env[name] = name.endsWith('_AVAILABLE') ? 'true' : '';
    Object.assign(env, { CODE_SIGNING_ENABLED: 'false', TAURI_UPDATES_ENABLED: 'true',
      TAURI_MIGRATION_ENABLED: 'true', TAURI_ROLLOUT_PCT: '100', EVENT_NAME: event,
      WORKFLOW_REF: event === 'pull_request' ? 'refs/pull/1/merge' : 'refs/heads/main',
      GITHUB_OUTPUT: output, NATUX_RELEASE_FIXTURE_ABSENT: String(absent) });
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { cwd: repository, env, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.ifError(result.error);
    const contents = await readFile(output, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const callLog = await readFile(calls, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    return { status: result.status, log: `${result.stdout}\n${result.stderr}`,
      calls: callLog.trim() ? callLog.trim().split(/\r?\n/).length : 0,
      outputs: Object.fromEntries(contents.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean).map(line => line.split('='))) };
  } finally {
    await assertCanonicalDirectory(owner);
    assert.equal(path.dirname(owner), runtime);
    assert.ok(path.basename(owner).startsWith('release-immutability-'));
    await rm(owner, { recursive: true, force: true });
  }
}

test('actual release plan preserves a complete published version on manual dispatch', { skip: process.platform !== 'win32' }, async () => {
  const result = await runPlan();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.calls, 1);
  assert.equal(result.outputs.release, 'false');
  assert.equal(result.outputs.tauri, 'false');
  assert.equal(result.outputs.migrationEnabled, 'false');
});

test('actual release plan refuses to rebuild an incomplete published version', { skip: process.platform !== 'win32' }, async () => {
  const result = await runPlan({ incomplete: true });
  assert.notEqual(result.status, 0, result.log);
  assert.equal(result.calls, 1);
  assert.match(result.log, /new version|bump.*version|increment.*version/i);
  assert.notEqual(result.outputs.release, 'true');
});

test('published Tauri release requires the native executable hash artifact for every platform', { skip: process.platform !== 'win32' }, async () => {
  for (const platform of ['windows-x86_64', 'darwin-x86_64', 'darwin-aarch64']) {
    const result = await runPlan({ missingAsset: `executable-sha512-${platform}.txt` });
    assert.notEqual(result.status, 0, `Missing native hash must fail: ${platform}\n${result.log}`);
    assert.match(result.log, /new version/i);
    assert.notEqual(result.outputs.release, 'true');
  }
});

for (const [name, fixture] of [['draft', { draft: true, incomplete: true }], ['absent', { absent: true }]]) {
  test(`actual release plan can prepare a ${name} release`, { skip: process.platform !== 'win32' }, async () => {
    const result = await runPlan(fixture);
    assert.equal(result.status, 0, result.log);
    assert.equal(result.calls, 1);
    assert.equal(result.outputs.release, 'true');
    assert.equal(result.outputs.tauri, 'true');
  });
}

test('actual PR release plan cannot publish and never calls gh', { skip: process.platform !== 'win32' }, async () => {
  const result = await runPlan({ event: 'pull_request' });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.calls, 0);
  assert.equal(result.outputs.release, 'false');
  assert.equal(result.outputs.tauri, 'false');
});

test('versioned upload checks the current remote draft state before any replacement', () => {
  const publish = workflow.jobs.publish.steps.find(step => step.name === 'Create or complete draft release').run;
  const upload = publish.indexOf('gh release upload');
  const probe = publish.indexOf('--json isDraft');
  assert.ok(probe >= 0 && probe < upload, 'Remote draft state must be rechecked immediately before writes.');
  const guard = publish.slice(probe, upload);
  assert.match(guard, /==\s*['"]true['"]/);
  assert.match(guard, /exit 1/);
  assert.match(guard, /immutable|published/i);
  assert.match(publish.slice(upload), /--clobber/);
  assert.doesNotMatch(plan.run, /Manual dispatch.*rebuild|\$tauriRequested -and \$env:EVENT_NAME -eq 'workflow_dispatch'/);
});

async function runUpload(state) {
  const runtime = path.join(repository, 'tests/.runtime');
  await mkdir(runtime, { recursive: true });
  await assertCanonicalDirectory(runtime);
  const owner = await mkdtemp(path.join(runtime, 'release-immutability-upload-'));
  await assertCanonicalDirectory(owner);
  try {
    await mkdir(path.join(owner, 'release'));
    await writeFile(path.join(owner, 'release/latest.yml'), 'inert fixture\n', { flag: 'wx' });
    const upload = workflow.jobs.publish.steps.find(step => step.name === 'Create or complete draft release').run
      .replaceAll('${{ needs.plan.outputs.tauri }}', 'true');
    assert.ok(!upload.includes('${{'), 'All workflow expressions must be bound explicitly by this fixture.');
    await writeFile(path.join(owner, 'upload.sh'), `
function gh() {
  if [[ "$#" == 5 && "$1" == release && "$2" == view && "$3" == "$TAG" && "$4" == --repo && "$5" == "$GITHUB_REPOSITORY" ]]; then
    printf 'existence-view\\n' >> gh-calls.txt
    return 0
  fi
  if [[ "$#" == 9 && "$1" == release && "$2" == view && "$3" == "$TAG" && "$4" == --repo && "$5" == "$GITHUB_REPOSITORY" && "$6" == --json && "$7" == isDraft && "$8" == --jq && "$9" == .isDraft ]]; then
    printf 'draft-view\\n' >> gh-calls.txt
    if [[ "$NATUX_RELEASE_FIXTURE_STATE" == viewerror ]]; then return 23; fi
    printf '%s\\n' "$NATUX_RELEASE_FIXTURE_STATE"
    return 0
  fi
  if [[ "$#" -ge 7 && "$1" == release && "$2" == upload && "$3" == "$TAG" && "$*" == *' --repo Alex-dev-sys/NatuxWorld --clobber' ]]; then
    printf 'upload\\n' >> gh-calls.txt
    return 0
  fi
  printf 'Fake gh refuses this operation.\\n' >&2
  return 97
}
[[ "$(type -t gh)" == function ]] || exit 98
${upload}
`, { flag: 'wx' });
    // Intentionally pass no authentication/signing/provider environment.
    const env = shellEnvironment();
    Object.assign(env, { TAG: `v${version}`, VERSION: version, GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld',
      GITHUB_SHA: 'a'.repeat(40), NATUX_RELEASE_FIXTURE_STATE: state });
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', 'upload.sh'],
      { cwd: owner, env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    assert.ifError(result.error);
    const calls = (await readFile(path.join(owner, 'gh-calls.txt'), 'utf8')).trim().split('\n');
    return { status: result.status, calls, log: `${result.stdout}\n${result.stderr}` };
  } finally {
    await assertCanonicalDirectory(owner);
    assert.equal(path.dirname(owner), runtime);
    assert.ok(path.basename(owner).startsWith('release-immutability-upload-'));
    await rm(owner, { recursive: true, force: true });
  }
}

for (const [state, expectedStatus] of [['false', 1], ['true', 0], ['viewerror', 23]]) {
  test(`actual Bash upload step is fail-closed for remote draft state ${state}`, { skip: !bashAvailable }, async () => {
    const result = await runUpload(state);
    assert.equal(result.status, expectedStatus, result.log);
    assert.deepEqual(result.calls, state === 'true' ? ['existence-view', 'draft-view', 'upload'] : ['existence-view', 'draft-view']);
    if (state === 'false') assert.match(result.log, /published release; publish a new version/);
  });
}
