import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/prepare-webview2-ci.ps1', import.meta.url));
const windows = process.platform === 'win32';

function safeEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === 'NATUX_EPHEMERAL_WEBVIEW_REMOVAL') delete environment[key];
  }
  // Never run Prepare with acknowledged removal, even on a hosted test runner.
  environment.NATUX_EPHEMERAL_WEBVIEW_REMOVAL = '';
  return environment;
}

function powershell(args) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
    { encoding: 'utf8', windowsHide: true, stdio: 'pipe', timeout: 30_000, env: safeEnvironment() });
}

function helper(expression) {
  const source = `$ProgressPreference = 'SilentlyContinue'; . '${script.replaceAll("'", "''")}'; ${expression}`;
  return powershell(['-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')]);
}

test('WebView2 preparation defaults to read-only and never deletes files or fabricates registry state', async () => {
  const source = await readFile(script, 'utf8');
  assert.match(source, /\$Action = 'Check'/);
  assert.doesNotMatch(source, /Remove-Item|Remove-ItemProperty|Set-ItemProperty|Stop-Process|\.DeleteSubKey|\.SetValue\(/i);
  assert.match(source, /Assert-WebViewCiGuards\s+\$before = Get-WebViewRuntimeState/);
  assert.match(source, /Is64BitProcess/);
  assert.match(source, /\$identity.Name.Split\('\\'\)\[-1\] -ine 'runneradmin'/);
  assert.match(source, /\$_.Sid -eq 'S-1-16-12288'/);
  assert.match(source, /function Assert-NoWebViewProcesses/);
  assert.match(source, /ReparsePoint/);
  assert.match(source, /Get-AuthenticodeSignature -LiteralPath \$candidate.path/);
  assert.match(source, /Microsoft Corporation/);
  assert.match(source, /\$code -notin @\(0, 19, 3010\)/);
  assert.match(source, /-not \$after.installed -and \$after.executablePaths.Count -eq 0/);
});

test('default invocation reads all three official runtime registrations without mutation', { skip: !windows }, () => {
  const state = JSON.parse(powershell(['-File', script]));
  assert.equal(typeof state.installed, 'boolean');
  assert.ok(state.version === null || /^\d+\.\d+\.\d+\.\d+$/.test(state.version));
  assert.equal(state.registry.length, 3);
  assert.ok(state.registry.some(entry => entry.path.startsWith('HKLM:\\SOFTWARE\\WOW6432Node\\')));
  assert.ok(state.registry.some(entry => entry.path.startsWith('HKLM:\\SOFTWARE\\Microsoft\\')));
  assert.ok(state.registry.some(entry => entry.path.startsWith('HKCU:\\SOFTWARE\\Microsoft\\')));
  assert.equal(state.installed, state.registry.some(entry => entry.installed));
  assert.ok(Array.isArray(state.executablePaths));
  assert.ok(Array.isArray(state.installerCandidates));
  assert.equal(state.prepared, undefined);
});

test('Prepare actually refuses with the removal acknowledgement explicitly cleared', { skip: !windows }, () => {
  assert.throws(() => powershell(['-File', script, '-Action', 'Prepare']), error => {
    assert.notEqual(error.status, 0);
    assert.match(String(error.stderr), /NATUX_EPHEMERAL_WEBVIEW_REMOVAL=YES/);
    return true;
  });
});

test('vendor arguments and canonical numeric-version path boundary helpers are executable', { skip: !windows }, () => {
  const result = JSON.parse(helper(`
    $root = 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application'
    $valid = Join-Path $root '123.0.2420.97\\Installer\\setup.exe'
    @{
      userArguments = @(Get-WebViewUninstallArguments $false)
      machineArguments = @(Get-WebViewUninstallArguments $true)
      valid = Test-WebViewSetupPath $valid $root
      traversal = Test-WebViewSetupPath (Join-Path $root '..\\Edge\\Application\\123.0.2420.97\\Installer\\setup.exe') $root
      sibling = Test-WebViewSetupPath 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application-evil\\123.0.2420.97\\Installer\\setup.exe' $root
      nonnumeric = Test-WebViewSetupPath (Join-Path $root 'current\\Installer\\setup.exe') $root
      browser = Test-WebViewSetupPath (Join-Path $root '123.0.2420.97\\msedge.exe') $root
      nested = Test-WebViewSetupPath (Join-Path $root '123.0.2420.97\\other\\Installer\\setup.exe') $root
      relative = Test-WebViewSetupPath '123.0.2420.97\\Installer\\setup.exe' $root
      zero = (ConvertTo-WebViewVersion '0.0.0.0').ToString()
    } | ConvertTo-Json -Compress
  `));
  const args = ['--uninstall', '--msedgewebview', '--force-uninstall', '--verbose-logging'];
  assert.deepEqual(result.userArguments, args);
  assert.deepEqual(result.machineArguments, [...args, '--system-level']);
  assert.equal(result.valid, true);
  for (const key of ['traversal', 'sibling', 'nonnumeric', 'browser', 'nested', 'relative']) assert.equal(result[key], false, key);
  assert.equal(result.zero, '0.0.0.0');
});

test('all hosted-CI environment guards fail closed and malformed pv is never treated as missing', { skip: !windows }, () => {
  const result = JSON.parse(helper(`
    $valid = @{
      NATUX_EPHEMERAL_WEBVIEW_REMOVAL = 'YES'; CI = 'true'; GITHUB_ACTIONS = 'true'
      RUNNER_ENVIRONMENT = 'github-hosted'; RUNNER_OS = 'Windows'
      GITHUB_REPOSITORY = 'Alex-dev-sys/NatuxWorld'; GITHUB_EVENT_NAME = 'workflow_dispatch'
    }
    Assert-WebViewCiEnvironment $valid
    $denied = @()
    foreach ($key in @($valid.Keys)) {
      $copy = $valid.Clone(); $copy[$key] = 'wrong'
      try { Assert-WebViewCiEnvironment $copy } catch { $denied += $key }
    }
    $invalidVersions = @()
    foreach ($value in @('garbage', '1.2', '-1.0.0.0', '99999999999.0.0.0')) {
      try { ConvertTo-WebViewVersion $value | Out-Null } catch { $invalidVersions += $value }
    }
    @{ denied = $denied; invalidVersions = $invalidVersions } | ConvertTo-Json -Compress
  `));
  assert.equal(result.denied.length, 7);
  assert.equal(result.invalidVersions.length, 4);
  assert.equal(path.basename(script), 'prepare-webview2-ci.ps1');
});
