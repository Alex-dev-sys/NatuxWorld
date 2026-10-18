const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

function readUpgradeConfig(env, username = os.userInfo().username) {
  assert.equal(env.NATUX_TAURI_UPGRADE_ACCEPTANCE, '1', 'Set NATUX_TAURI_UPGRADE_ACCEPTANCE=1 for a real signed updater acceptance.');
  assert.equal(env.NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT, 'YES', 'Use a dedicated Windows test account for installer registry and shortcuts.');
  assert.equal(env.NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT?.toLowerCase(), username.toLowerCase(), 'Configured Windows account must match the current account.');
  const ephemeral = env.NATUX_TAURI_UPGRADE_EPHEMERAL_CI;
  if (env.GITHUB_ACTIONS === 'true' || env.RUNNER_ENVIRONMENT === 'github-hosted') {
    assert.equal(ephemeral, 'YES', 'Hosted upgrade must explicitly acknowledge its ephemeral account.');
  }
  if (ephemeral) assert.equal(ephemeral, 'YES', 'Ephemeral CI must be explicitly acknowledged with YES.');
  if (ephemeral === 'YES') {
    const required = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Windows',
      GITHUB_REPOSITORY: 'Alex-dev-sys/NatuxWorld', GITHUB_EVENT_NAME: 'workflow_dispatch' };
    for (const [key, value] of Object.entries(required)) assert.equal(env[key], value, `Hosted upgrade requires ${key}=${value}.`);
    assert.match(username, /^NatuxUpTest[0-9a-f]{8}$/i, 'Hosted upgrade requires a newly owned standard test account.');
    assert.match(env.NATUX_TAURI_UPGRADE_ACCOUNT_SID ?? '', /^S-1-5-21-(?:[0-9]+-){3}[0-9]+$/, 'Hosted upgrade requires the created account SID.');
  } else {
    assert.ok(/test/i.test(username), 'Dedicated Windows account must contain test.');
  }
  const keys = ['PREVIOUS_INSTALLER', 'PREVIOUS_VERSION', 'TARGET_INSTALLER', 'TARGET_HASH_FILE'];
  for (const key of keys) assert.ok(env[`NATUX_TAURI_UPGRADE_${key}`]?.trim(), `Set NATUX_TAURI_UPGRADE_${key}.`);
  assert.match(env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const channel = env.NATUX_TAURI_UPGRADE_CHANNEL || 'beta';
  assert.ok(channel === 'stable' || channel === 'beta', 'Upgrade channel must be stable or beta.');
  const previousKind = env.NATUX_TAURI_UPGRADE_PREVIOUS_KIND || 'provided_artifact';
  assert.ok(['provided_artifact', 'published_previous', 'fresh_candidate'].includes(previousKind), 'Previous kind must distinguish a published release from a fresh candidate.');
  return { previousInstaller: env.NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER,
    previousVersion: env.NATUX_TAURI_UPGRADE_PREVIOUS_VERSION,
    targetInstaller: env.NATUX_TAURI_UPGRADE_TARGET_INSTALLER,
    targetHashFile: env.NATUX_TAURI_UPGRADE_TARGET_HASH_FILE, channel, previousKind, ephemeral: ephemeral === 'YES',
    accountSid: ephemeral === 'YES' ? env.NATUX_TAURI_UPGRADE_ACCOUNT_SID : null };
}

async function assertStandardUpgradeContext(config, execute) {
  const { stdout: identity, stderr: identityError = '' } = await execute('whoami.exe', ['/user', '/fo', 'csv', '/nh'],
    { windowsHide: true, timeout: 5000, maxBuffer: 8192 });
  assert.equal(identityError.trim(), '', 'Windows account SID query must succeed.');
  const sids = identity.match(/S-1-5-21-(?:[0-9]+-){3}[0-9]+/g) ?? [];
  assert.equal(sids.length, 1, 'Windows account query must return exactly one user SID.');
  if (config.ephemeral) assert.equal(sids[0], config.accountSid, 'Upgrade must run under the exact created account SID.');
  const { stdout, stderr = '' } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'tauri-upgrade-process-probe.ps1'), '-TestProcessId', String(process.pid)],
  { windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 });
  assert.equal(stderr.trim(), '', 'Windows process token query must succeed.');
  const context = JSON.parse(stdout);
  assert.equal(context.testToken?.queryable, true, 'Actual acceptance process token must be queryable.');
  assert.equal(context.testToken.elevated, false, 'Medium integrity alone is insufficient: acceptance must use a non-elevated token.');
  assert.equal(context.testToken.integritySid, 'S-1-16-8192', 'Acceptance requires ordinary Medium integrity.');
  return { ...context, accountSid: sids[0] };
}

module.exports = { readUpgradeConfig, assertStandardUpgradeContext };
