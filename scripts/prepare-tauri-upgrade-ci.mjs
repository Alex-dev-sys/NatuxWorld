import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'Alex-dev-sys/NatuxWorld';
const base = 'tests/.runtime/tauri-upgrade';
const runFile = promisify(execFile);
const keys = ['PREVIOUS_VERSION', 'PREVIOUS_INSTALLER', 'TARGET_INSTALLER', 'TARGET_HASH_FILE', 'CHANNEL', 'PREVIOUS_KIND']
  .map(key => `NATUX_TAURI_UPGRADE_${key}`).concat('NATUX_UPGRADE_CANDIDATE_CONFIG');

export function parseVersion(value) {
  assert.equal(typeof value, 'string', 'Version must be a string.');
  assert.ok(value.length <= 128, 'Version must be bounded.');
  const parsed = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  assert.ok(parsed && parsed[0] === value, 'Version must be strict SemVer.');
  const prerelease = parsed[4]?.split('.') ?? [];
  assert.ok(prerelease.every(part => !/^\d+$/.test(part) || part === '0' || !part.startsWith('0')), 'Numeric prerelease identifiers cannot have leading zeroes.');
  return { core: parsed.slice(1, 4), prerelease };
}

function numericCompare(a, b) { return a.length === b.length ? (a === b ? 0 : a < b ? -1 : 1) : a.length < b.length ? -1 : 1; }

export function compareVersions(first, second) {
  const a = parseVersion(first); const b = parseVersion(second);
  for (let i = 0; i < 3; i++) { const order = numericCompare(a.core[i], b.core[i]); if (order) return order; }
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const left = a.prerelease[i]; const right = b.prerelease[i];
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1;
    if (left === right) continue;
    const ln = /^\d+$/.test(left); const rn = /^\d+$/.test(right);
    return ln && rn ? numericCompare(left, right) : ln !== rn ? ln ? -1 : 1 : left < right ? -1 : 1;
  }
  return 0;
}

export function createUpgradePlan(env, packageVersion, tauriVersion) {
  const required = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
    GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: 'workflow_dispatch' };
  for (const [key, value] of Object.entries(required)) assert.equal(env[key], value, `Preparation requires ${key}=${value}.`);
  parseVersion(packageVersion);
  assert.ok(!packageVersion.includes('+'), 'Installer acceptance versions do not support build metadata.');
  assert.equal(tauriVersion, packageVersion, 'Root package and Tauri config versions must agree.');
  assert.equal(env.NATUX_UPGRADE_TARGET_RELEASE, `v${packageVersion}`, 'Target must be the exact checked-out launcher version tag.');
  const previousTag = env.NATUX_UPGRADE_PREVIOUS_RELEASE || '';
  const candidate = env.NATUX_UPGRADE_PREVIOUS_CANDIDATE || '';
  assert.ok(Boolean(previousTag) !== Boolean(candidate), 'Choose exactly one previous published release or fresh candidate.');
  if (previousTag) assert.ok(previousTag.startsWith('v'), 'Previous release must be a version tag starting with v.');
  const previousVersion = previousTag ? previousTag.slice(1) : candidate;
  assert.ok(!previousVersion.includes('+'), 'Installer acceptance versions do not support build metadata.');
  assert.ok(compareVersions(previousVersion, packageVersion) < 0, 'Previous version must precede the target by SemVer precedence.');
  const targetName = `NatuxWorld-${packageVersion}-x64-setup.exe`;
  const previousName = `NatuxWorld-${previousVersion}-x64-setup.exe`;
  const channel = parseVersion(packageVersion).prerelease.length ? 'beta' : 'stable';
  const kind = previousTag ? 'published_previous' : 'fresh_candidate';
  const environment = {
    NATUX_TAURI_UPGRADE_PREVIOUS_VERSION: previousVersion,
    NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER: `${base}/previous/${previousName}`,
    NATUX_TAURI_UPGRADE_TARGET_INSTALLER: `${base}/target/${targetName}`,
    NATUX_TAURI_UPGRADE_TARGET_HASH_FILE: `${base}/target/executable-sha512-windows-x86_64.txt`,
    NATUX_TAURI_UPGRADE_CHANNEL: channel, NATUX_TAURI_UPGRADE_PREVIOUS_KIND: kind,
    NATUX_UPGRADE_CANDIDATE_CONFIG: candidate ? `${base}/previous-version.json` : '',
  };
  return { targetTag: `v${packageVersion}`, targetName, previousTag, previousName, previousVersion, kind, environment };
}

export function requiredAssets(name, target) {
  return [{ name, maxBytes: 300 * 1024 * 1024 }, { name: `${name}.sig`, maxBytes: 4096 }]
    .concat(target ? [{ name: 'executable-sha512-windows-x86_64.txt', maxBytes: 132 }] : []);
}

export function validateRelease(metadata, tag, assets) {
  assert.equal(metadata.tagName, tag, 'Release metadata must match the exact requested tag.');
  assert.equal(metadata.isDraft, false, 'Only actual non-draft published releases can be used.');
  assert.ok(Array.isArray(metadata.assets), 'Release assets must be present.');
  for (const expected of assets) {
    const matches = metadata.assets.filter(asset => asset.name === expected.name);
    assert.equal(matches.length, 1, `Release must have exactly one ${expected.name}.`);
    assert.ok(Number.isSafeInteger(matches[0].size) && matches[0].size > 0 && matches[0].size <= expected.maxBytes,
      `Release asset ${expected.name} must be nonempty and bounded.`);
  }
}

export function serializeEnvironment(environment) {
  assert.deepEqual(Object.keys(environment).sort(), [...keys].sort(), 'Only the known upgrade variables can be emitted.');
  for (const [key, value] of Object.entries(environment)) {
    assert.equal(typeof value, 'string');
    assert.ok((value.length > 0 || key === 'NATUX_UPGRADE_CANDIDATE_CONFIG') && /^[0-9A-Za-z_./+-]*$/.test(value), 'Unsafe environment value.');
    assert.ok(!value.split('/').some(part => part === '..' || part === '.'), 'Environment paths must not traverse directories.');
    if (key.endsWith('_INSTALLER') || key.endsWith('_HASH_FILE') || key === 'NATUX_UPGRADE_CANDIDATE_CONFIG') {
      assert.ok(value === '' || value.startsWith(`${base}/`), 'Environment artifact paths must stay within the fixed relative owner.');
    }
  }
  return keys.map(key => `${key}=${environment[key]}\n`).join('');
}

async function canonicalFile(filename, maxBytes, allowEmpty = false) {
  assert.ok(path.isAbsolute(filename));
  const stat = await lstat(filename);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes && (allowEmpty || stat.size > 0), 'File must be regular and bounded.');
  assert.equal((await realpath(filename)).toLowerCase(), path.resolve(filename).toLowerCase(), 'File path must not traverse junctions.');
}

async function gh(args) {
  const result = await runFile('gh', args, { cwd: repository, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout;
}

async function release(tag, assets) {
  const metadata = JSON.parse(await gh(['release', 'view', tag, '--repo', repo, '--json', 'tagName,isDraft,assets']));
  validateRelease(metadata, tag, assets);
}

async function download(tag, assets, directory) {
  await gh(['release', 'download', tag, '--repo', repo, '--dir', directory, ...assets.flatMap(asset => ['--pattern', asset.name])]);
  assert.deepEqual((await readdir(directory)).sort(), assets.map(asset => asset.name).sort(), 'Download must contain only the exact requested artifacts.');
  for (const asset of assets) await canonicalFile(path.join(directory, asset.name), asset.maxBytes);
}

async function main() {
  assert.equal(process.platform, 'win32', 'Preparation requires a native Windows CI job.');
  assert.equal(os.userInfo().username.toLowerCase(), 'runneradmin', 'Preparation requires the actual ephemeral runner account.');
  const packageJson = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
  const tauri = JSON.parse(await readFile(path.join(repository, 'src', 'native', 'tauri.conf.json'), 'utf8'));
  const plan = createUpgradePlan(process.env, packageJson.version, tauri.version);
  const serialized = serializeEnvironment(plan.environment);
  const envFile = process.env.GITHUB_ENV;
  assert.ok(envFile, 'GITHUB_ENV must be supplied by the workflow.');
  await canonicalFile(envFile, 1024 * 1024, true);
  const targetAssets = requiredAssets(plan.targetName, true);
  const previousAssets = requiredAssets(plan.previousName, false);
  await release(plan.targetTag, targetAssets);
  if (plan.previousTag) await release(plan.previousTag, previousAssets);
  // Validate each existing parent before creating the fixed new artifact owner.
  // A failed/partial earlier attempt is retained; there is no recursive cleanup.
  let parent = repository;
  for (const part of ['tests', '.runtime']) {
    parent = path.join(parent, part);
    try { await lstat(parent); } catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(parent); }
    assert.ok((await lstat(parent)).isDirectory() && !(await lstat(parent)).isSymbolicLink());
    assert.equal((await realpath(parent)).toLowerCase(), parent.toLowerCase(), 'Artifact parents must not traverse junctions.');
  }
  const owner = path.join(repository, base);
  await mkdir(owner); // EEXIST must fail; do not clobber previous evidence.
  const target = path.join(owner, 'target'); const previous = path.join(owner, 'previous');
  await mkdir(target); await mkdir(previous);
  await download(plan.targetTag, targetAssets, target);
  const nativeHash = (await readFile(path.join(target, 'executable-sha512-windows-x86_64.txt'), 'utf8')).trim();
  assert.match(nativeHash, /^[0-9a-f]{128}$/, 'Published native executable hash must be lowercase SHA512.');
  if (plan.previousTag) await download(plan.previousTag, previousAssets, previous);
  else await writeFile(path.join(owner, 'previous-version.json'), `${JSON.stringify({ version: plan.previousVersion })}\n`, { flag: 'wx' });
  // Only a fully validated download/config may affect later workflow steps.
  await canonicalFile(envFile, 1024 * 1024, true);
  await appendFile(envFile, `\n${serialized}`, 'utf8');
  process.stdout.write(`${JSON.stringify({ target: plan.targetTag, previous: plan.previousVersion, kind: plan.kind })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
