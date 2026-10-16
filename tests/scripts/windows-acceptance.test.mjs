import assert from 'node:assert/strict';
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
  assert.equal(job.steps.filter(step => JSON.stringify(step.env ?? {}).includes('secrets.TAURI_SIGNING_PRIVATE_KEY')).length, 1);
  const accept = job.steps.find(step => step.name === 'Accept actual published signed update at Medium integrity');
  assert.deepEqual(accept.env, { NATUX_TAURI_UPGRADE_ACCEPTANCE: '1', NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT: 'YES',
    NATUX_TAURI_UPGRADE_EPHEMERAL_CI: 'YES' });
  assert.match(accept.run, /NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT = \[Environment\]::UserName/);
  assert.match(accept.run, /run-windows-acceptance\.ps1 -Suite signed-upgrade/);
  const source = await readFile(script, 'utf8');
  assert.ok(source.includes("'signed-upgrade' = 'tests/e2e/tauri-upgrade.test.cjs'"));
  for (const command of ['npm run build:lock-runtime', 'cargo build --manifest-path src/native/Cargo.toml --locked --bin verify-updater-signature']) {
    const index = job.steps.findIndex(step => step.run === command);
    assert.ok(index > job.steps.indexOf(prepare) && index < job.steps.indexOf(accept));
  }
  assert.doesNotMatch(JSON.stringify(workflow), /contents":"write|UPDATE_SIGNING_PRIVATE_KEY|gh release (?:create|edit|upload)|NATUX_EPHEMERAL_WEBVIEW_REMOVAL/);
  const receipt = job.steps.find(step => step.name === 'Upload signed upgrade acceptance evidence');
  assert.equal(receipt.if, 'always()');
  assert.equal(receipt.with.path, 'tests/.runtime/tauri-upgrade-result.json');
});
