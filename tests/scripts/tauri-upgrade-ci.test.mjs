import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, createUpgradePlan, parseVersion, requiredAssets, serializeEnvironment, validateRelease }
  from '../../scripts/prepare-tauri-upgrade-ci.mjs';

const guards = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
  GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_EVENT_NAME: 'workflow_dispatch' };
const candidate = { ...guards, NATUX_UPGRADE_TARGET_RELEASE: 'v1.10.0', NATUX_UPGRADE_PREVIOUS_CANDIDATE: '1.10.0-rc.0' };

test('strict SemVer comparison implements numeric and prerelease precedence without number rounding', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2',
    '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.9.9', '1.10.0', '2.0.0'];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareVersions(ordered[i], ordered[i + 1]), -1);
    assert.equal(compareVersions(ordered[i + 1], ordered[i]), 1);
  }
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0);
  assert.equal(compareVersions('1.0.0-999999999999999999999', '1.0.0-1000000000000000000000'), -1);
  assert.equal(compareVersions('999999999999999999999.0.0', '1000000000000000000000.0.0'), -1);
  for (const version of ['v1.0.0', '01.0.0', '1.0', '1.0.0-01', '1.0.0-a..b', '1.0.0+', '1.0.0\n', '1.0.0\nEVIL=1', '../1.0.0']) {
    assert.throws(() => parseVersion(version), version);
  }
});

test('preparation requires every official CI guard, exact target configuration and exactly one older mode', () => {
  const plan = createUpgradePlan(candidate, '1.10.0', '1.10.0');
  assert.equal(plan.kind, 'fresh_candidate');
  assert.equal(plan.environment.NATUX_TAURI_UPGRADE_CHANNEL, 'stable');
  assert.equal(plan.environment.NATUX_UPGRADE_CANDIDATE_CONFIG, 'tests/.runtime/tauri-upgrade/previous-version.json');
  for (const key of Object.keys(guards)) {
    assert.throws(() => createUpgradePlan({ ...candidate, [key]: 'wrong' }, '1.10.0', '1.10.0'), key);
    const missing = { ...candidate }; delete missing[key];
    assert.throws(() => createUpgradePlan(missing, '1.10.0', '1.10.0'), key);
  }
  assert.throws(() => createUpgradePlan(candidate, '1.10.0', '1.9.15'), /must agree/);
  assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_TARGET_RELEASE: 'v1.9.15' }, '1.10.0', '1.10.0'), /exact/);
  assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_PREVIOUS_RELEASE: 'v1.9.15' }, '1.10.0', '1.10.0'), /exactly one/);
  assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_PREVIOUS_CANDIDATE: '' }, '1.10.0', '1.10.0'), /exactly one/);
  for (const previous of ['1.10.0', '1.10.0+same-precedence', '1.11.0', '../1.9.0']) {
    assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_PREVIOUS_CANDIDATE: previous }, '1.10.0', '1.10.0'));
  }
  assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_PREVIOUS_CANDIDATE: '1.9.0+build.1' }, '1.10.0', '1.10.0'), /do not support build metadata/);
  assert.throws(() => createUpgradePlan({ ...candidate, NATUX_UPGRADE_TARGET_RELEASE: 'v1.10.0+build.1' }, '1.10.0+build.1', '1.10.0+build.1'), /do not support build metadata/);
  const published = createUpgradePlan({ ...guards, NATUX_UPGRADE_TARGET_RELEASE: 'v1.10.0-beta.2',
    NATUX_UPGRADE_PREVIOUS_RELEASE: 'v1.10.0-beta.1' }, '1.10.0-beta.2', '1.10.0-beta.2');
  assert.equal(published.kind, 'published_previous');
  assert.equal(published.environment.NATUX_TAURI_UPGRADE_CHANNEL, 'beta');
  assert.equal(published.environment.NATUX_UPGRADE_CANDIDATE_CONFIG, '');
});

test('only existing non-draft native release asset metadata is accepted with strict bounds and names', () => {
  const assets = requiredAssets('NatuxWorld-1.10.0-x64-setup.exe', true);
  const metadata = { tagName: 'v1.10.0', isDraft: false, assets: assets.map(asset => ({ name: asset.name, size: 1 })) };
  validateRelease(metadata, 'v1.10.0', assets);
  for (const wrong of [{ ...metadata, isDraft: true }, { ...metadata, tagName: 'v1.9.15' },
    { ...metadata, assets: metadata.assets.slice(1) }, { ...metadata, assets: [...metadata.assets, metadata.assets[0]] },
    { ...metadata, assets: [{ name: 'NATUX-WORLD-Setup-1.9.15-x64.exe', size: 1 }] }]) {
    assert.throws(() => validateRelease(wrong, 'v1.10.0', assets));
  }
  for (const size of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => validateRelease({ ...metadata, assets: metadata.assets.map(asset => ({ ...asset, size })) }, 'v1.10.0', assets));
  }
  assert.equal(requiredAssets('NatuxWorld-1.9.0-x64-setup.exe', false).length, 2);
});

test('GitHub environment serialization cannot inject commands, extra variables or redirected paths', () => {
  const plan = createUpgradePlan(candidate, '1.10.0', '1.10.0');
  const lines = serializeEnvironment(plan.environment).trimEnd().split('\n');
  assert.equal(lines.length, 7);
  assert.ok(lines.includes('NATUX_TAURI_UPGRADE_PREVIOUS_KIND=fresh_candidate'));
  for (const value of ['x\nEVIL=1', 'x\rEVIL=1', '../escape', 'C:\\outside', '/tmp/absolute', '/tmp/path$HOME', 'x\0']) {
    assert.throws(() => serializeEnvironment({ ...plan.environment, NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER: value }), value);
  }
  assert.throws(() => serializeEnvironment({ ...plan.environment, GH_TOKEN: 'secret' }), /known/);
});
