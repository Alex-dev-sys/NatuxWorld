import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repository, 'scripts/run-windows-acceptance.ps1');

test('prerequisite dispatch is isolated from publishing and consumes a successful matching Build artifact', async () => {
  const workflow = yaml.load(await readFile(path.join(repository, '.github/workflows/build.yml'), 'utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.webview_acceptance_run.required, false);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.webview_acceptance_kind.options, ['nsis', 'portable']);
  assert.equal(workflow.on.workflow_dispatch.inputs.webview_acceptance_kind.default, 'nsis');
  assert.match(workflow.jobs.plan.if, /inputs\.webview_acceptance_run == ''/);
  const job = workflow.jobs.webview_bootstrap;
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
  assert.equal(job.needs, undefined);
  assert.match(job.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(job.if, /github\.repository == 'Alex-dev-sys\/NatuxWorld'/);
  const download = job.steps.find((step) => step.name.startsWith('Download accepted'));
  assert.equal(download.env.ACCEPTANCE_RUN, '${{ inputs.webview_acceptance_run }}');
  assert.match(download.run, /\$source\.conclusion -ne 'success'/);
  assert.match(download.run, /\$source\.head_sha -cne \$env:GITHUB_SHA/);
  assert.match(download.run, /\$source\.head_repository\.full_name -cne \$env:GITHUB_REPOSITORY/);
  assert.match(download.run, /\$source\.path -ne '\.github\/workflows\/build\.yml'/);
  const removal = job.steps.filter((step) => step.env?.NATUX_EPHEMERAL_WEBVIEW_REMOVAL);
  assert.equal(removal.length, 1);
  assert.equal(removal[0].env.NATUX_EPHEMERAL_WEBVIEW_REMOVAL, 'YES');
  assert.match(removal[0].run, /prepare-webview2-ci\.ps1 -Action Prepare/);
  assert.ok(job.steps.indexOf(download) < job.steps.indexOf(removal[0]));
  assert.doesNotMatch(JSON.stringify(job), /contents":"write|TAURI_SIGNING_PRIVATE_KEY|UPDATE_SIGNING_PRIVATE_KEY|gh release/);
  assert.equal(workflow.jobs.publish.if, "needs.plan.outputs.release == 'true'");
  const nsis = job.steps.find(step => step.name.startsWith('Accept production NSIS'));
  const portable = job.steps.find(step => step.name.startsWith('Accept production Portable'));
  assert.equal(nsis.if, "inputs.webview_acceptance_kind == 'nsis'");
  assert.equal(portable.if, "inputs.webview_acceptance_kind == 'portable'");
  assert.equal(portable.env.NATUX_PORTABLE_WEBVIEW_ACCEPTANCE, '1');
  assert.equal(portable.env.NATUX_PORTABLE_WEBVIEW_SOURCE_RUN, '${{ inputs.webview_acceptance_run }}');
  assert.match(portable.run, /run-windows-acceptance\.ps1 -Suite portable-webview/);
  const stage = workflow.jobs.windows.steps.find(step => step.name === 'Stage exact accepted Windows installer');
  assert.match(stage.run, /Copy-Item -LiteralPath "release\/tauri\/\$portableName"/);
  assert.match(stage.run, /portableSha512 = \(Get-FileHash -LiteralPath "\$directory\/\$portableName" -Algorithm SHA512\)/);
});

test('Windows UI acceptance uses production artifacts through a verified Medium-integrity child', async () => {
  const source = await readFile(script, 'utf8');
  const workflow = await readFile(path.join(repository, '.github/workflows/build.yml'), 'utf8');
  assert.match(source, /--integrity Medium --direct/);
  assert.match(source, /S-1-16-8192/);
  assert.match(source, /if \(\$InMediumProcess\) \{ throw/);
  assert.match(workflow, /winget install --exact --id gerardog\.gsudo --source winget/);
  for (const [suite, filename] of Object.entries({
    packaged: 'tauri-packaged.test.cjs', portable: 'tauri-portable.test.cjs',
    installed: 'tauri-installed.test.cjs', 'electron-migration': 'tauri-electron-migration.test.cjs',
    'webview-bootstrap': 'tauri-webview-bootstrap.test.cjs',
    'portable-webview': 'tauri-portable-webview.test.cjs',
  })) {
    assert.ok(source.includes(`'${suite}' = 'tests/e2e/${filename}'`));
    assert.ok(workflow.includes(`./scripts/run-windows-acceptance.ps1 -Suite ${suite}`));
    await access(path.join(repository, 'tests/e2e', filename));
  }
  assert.doesNotMatch(source, /additionalBrowserArgs|tauri:build|NATUX_TAURI_UPDATES_ENABLED|WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS\s*=/);
});

test('CI acceptance wrapper refuses local invocation, including a forged child flag', {
  skip: process.platform !== 'win32',
}, () => {
  for (const flags of [[], ['-InMediumProcess']]) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-Suite', 'packaged', ...flags], {
      cwd: repository, env: { ...process.env, CI: 'false', GITHUB_ACTIONS: 'false' },
      windowsHide: true, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /only for ephemeral hosted Windows CI/);
  }
});

test('disposable upgrade account provisioning refuses ordinary local and forged child invocation', {
  skip: process.platform !== 'win32',
}, () => {
  const wrapper = path.join(repository, 'scripts/run-tauri-upgrade-account-ci.ps1');
  for (const flags of [[], ['-ProbeOnly'], ['-Child', '-ConfigPath', 'unused.json']]) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', wrapper, ...flags], {
      cwd: repository, env: { ...process.env, CI: 'false', GITHUB_ACTIONS: 'false' },
      windowsHide: true, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error); assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /Official ephemeral upgrade CI requires/);
  }
});

test('ACL restoration accepts only Windows adding auto-inheritance metadata with identical permission bytes', {
  skip: process.platform !== 'win32',
}, () => {
  const original = 'O:BAG:S-1-5-21-4239583824-265399229-1323058055-513D:(A;;FA;;;BA)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;SY)(A;OICIIOID;GA;;;CO)(A;OICIID;0x1200a9;;;BU)(A;CIID;LC;;;BU)(A;CIID;DC;;;BU)';
  const inherited = original.replace('D:', 'D:AI');
  const cases = [
    { original, restored: original, expected: true },
    { original, restored: inherited, expected: true },
    { original: inherited, restored: inherited, expected: true },
    { original: inherited, restored: original, expected: false },
    ...[
      inherited.replace('D:AI', 'D:PAI'),
      inherited.replace('O:BA', 'O:SY'),
      inherited.replace('-513D:', '-514D:'),
      inherited.replace('(A;;FA;;;BA)', '(A;;FR;;;BA)'),
      inherited.replace('(A;;FA;;;BA)', '(D;;FA;;;BA)'),
      inherited.replace('(A;OICIID;FA;;;SY)', '(A;OICI;FA;;;SY)'),
      inherited.replace('D:AI', 'D:AI(A;;FA;;;S-1-5-21-1-2-3-9999)'),
      `${inherited}S:(AU;SA;FA;;;WD)`,
    ].map(restored => ({ original, restored, expected: false })),
  ];
  const modulePath = path.join(repository, 'scripts/windows-acl-equivalence.psm1').replaceAll("'", "''");
  const encodedCases = Buffer.from(JSON.stringify(cases)).toString('base64');
  const source = `$ErrorActionPreference = 'Stop'
    Import-Module '${modulePath}' -Force
    $cases = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedCases}')) | ConvertFrom-Json
    foreach ($item in $cases) {
      $actual = Test-NatuxAclRestoration -OriginalSddl $item.original -RestoredSddl $item.restored
      if ($actual -ne $item.expected) { throw 'ACL regression case changed the required restoration boundary.' }
    }
    $rejected = $false
    try { Test-NatuxAclRestoration -OriginalSddl 'invalid descriptor' -RestoredSddl $cases[0].restored | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'Malformed descriptors must fail closed.' }
    Write-Output 'ACL restoration regression cases passed.'`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(source, 'utf16le').toString('base64')], {
    windowsHide: true, encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ACL restoration regression cases passed/);
});

test('signed upgrade dispatch uses published artifacts and confines the signing secret to fresh candidate compilation', async () => {
  const workflow = yaml.load(await readFile(path.join(repository, '.github/workflows/tauri-upgrade.yml'), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.target_release.required, true);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.upgrade;
  assert.match(job.if, /github\.event_name == 'workflow_dispatch'/);
  assert.match(job.if, /github\.repository == 'Alex-dev-sys\/NatuxWorld'/);
  assert.equal(job['runs-on'], 'windows-latest');
  const prepare = job.steps.find(step => step.run === 'node scripts/prepare-tauri-upgrade-ci.mjs');
  assert.equal(prepare.env.NATUX_UPGRADE_TARGET_RELEASE, '${{ inputs.target_release }}');
  assert.equal(prepare.env.NATUX_UPGRADE_PREVIOUS_RELEASE, '${{ inputs.previous_release }}');
  assert.equal(prepare.env.NATUX_UPGRADE_PREVIOUS_CANDIDATE, '${{ inputs.previous_candidate_version }}');
  const build = job.steps.find(step => step.name === 'Build fresh signed previous candidate');
  assert.equal(build.if, "env.NATUX_TAURI_UPGRADE_PREVIOUS_KIND == 'fresh_candidate'");
  assert.equal(build.env.NATUX_TAURI_UPDATES_ENABLED, '1');
  assert.match(build.run, /run-tauri\.mjs build --config src\/native\/tauri\.updater\.conf\.json --config/);
  assert.match(build.run, /Copy-Item -LiteralPath "\$candidate\.sig"/);
  const context = job.steps.find(step => step.name === 'Verify a fresh standard Windows account before compilation');
  assert.ok(job.steps.indexOf(context) < job.steps.indexOf(build));
  assert.equal(context.run, './scripts/run-tauri-upgrade-account-ci.ps1 -ProbeOnly');
  assert.equal(job.steps.filter(step => JSON.stringify(step.env ?? {}).includes('secrets.TAURI_SIGNING_PRIVATE_KEY')).length, 1);
  const accept = job.steps.find(step => step.name === 'Accept actual published signed update in a standard Windows account');
  assert.deepEqual(accept.env, { NATUX_TAURI_UPGRADE_ACCEPTANCE: '1', NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_UPGRADE_EPHEMERAL_CI: 'YES' });
  assert.equal(accept.run, './scripts/run-tauri-upgrade-account-ci.ps1');
  assert.doesNotMatch(JSON.stringify(job), /gsudo|integrity Medium/);
  const source = await readFile(script, 'utf8');
  assert.ok(source.includes("'signed-upgrade' = 'tests/e2e/tauri-upgrade.test.cjs'"));
  for (const command of ['npm run build:lock-runtime', 'cargo build --manifest-path src/native/Cargo.toml --locked --bin verify-updater-signature']) {
    const index = job.steps.findIndex(step => step.run === command);
    assert.ok(index > job.steps.indexOf(prepare) && index < job.steps.indexOf(accept));
  }
  assert.doesNotMatch(JSON.stringify(workflow), /contents":"write|UPDATE_SIGNING_PRIVATE_KEY|gh release (?:create|edit|upload)|NATUX_EPHEMERAL_WEBVIEW_REMOVAL/);
  const receipt = job.steps.find(step => step.name === 'Upload signed upgrade acceptance evidence');
  assert.equal(receipt.if, 'always()');
  assert.equal(receipt.with['include-hidden-files'], true);
  assert.deepEqual(receipt.with.path.trim().split(/\r?\n/), [
    'tests/.runtime/tauri-upgrade-result.json', 'tests/.runtime/tauri-upgrade-failure.json',
    'tests/.runtime/tauri-upgrade-account-probe-result.json', 'tests/.runtime/tauri-upgrade-account-actual-result.json',
    'tests/.runtime/natux-upgrade-account-*/stdout.log', 'tests/.runtime/natux-upgrade-account-*/stderr.log',
    'tests/.runtime/natux-upgrade-account-*/child-context.json',
  ]);
});
