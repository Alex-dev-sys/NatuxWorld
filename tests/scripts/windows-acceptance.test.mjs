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
