const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);

function selectCurrentInstaller(names, productName, version, architecture = 'x64') {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'expected a package version');
  const expected = `${productName}_${version}_${architecture}-setup.exe`;
  const matches = names.filter((name) => name.toLowerCase() === expected.toLowerCase());
  assert.equal(matches.length, 1, `expected exactly one current NSIS setup artifact: ${expected}`);
  return matches[0];
}

async function assertNoExistingInstallation(productName = 'NATUX WORLD', execute = runFile) {
  assert.ok(typeof productName === 'string' && productName.length > 0 && productName.length <= 128
    && [...productName].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
  'expected a bounded installation product name');
  const literal = productName.replaceAll("'", "''");
  const script = `
    $ErrorActionPreference = 'Stop'
    $product = '${literal}'
    $roots = @(
      @([Microsoft.Win32.Registry]::CurrentUser, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'),
      @([Microsoft.Win32.Registry]::LocalMachine, 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'),
      @([Microsoft.Win32.Registry]::LocalMachine, 'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
    )
    $found = 0
    foreach ($root in $roots) {
      $key = $root[0].OpenSubKey($root[1], $false)
      if ($null -eq $key) { continue }
      try {
        foreach ($name in $key.GetSubKeyNames()) {
          $registration = $key.OpenSubKey($name, $false)
          if ($null -eq $registration) { throw 'An uninstall registration disappeared during the installation probe.' }
          try {
            $displayName = $registration.GetValue('DisplayName', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if ($null -eq $displayName) { continue }
            if ($displayName -isnot [string]) { throw 'An uninstall registration has an invalid DisplayName.' }
            if ($displayName.StartsWith($product, [StringComparison]::OrdinalIgnoreCase)) { $found++ }
          } finally { $registration.Dispose() }
        }
      } finally { $key.Dispose() }
    }
    [Console]::Out.WriteLine($found)
  `;
  // The hosted read-only probe exceeded the former 15 s cap.
  // Keep a finite limit and never interpret process/read failures as absence.
  const { stdout, stderr } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 60_000 });
  assert.equal(stderr.trim(), '', 'Installation probe reported a registry read error.');
  assert.match(stdout.trim(), /^(?:0|[1-9]\d*)$/, 'Installation probe returned an invalid registration count.');
  const count = Number(stdout.trim());
  assert.ok(Number.isSafeInteger(count), 'Installation probe returned an invalid registration count.');
  assert.equal(count, 0,
    'An existing NATUX installation is registered. Run installer acceptance in a clean dedicated Windows test account to preserve registry and shortcuts.');
}

function isolatedInstallerEnvironment(appData, localAppData) {
  const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NATUX_E2E_') || key.startsWith('NATUX_TAURI_E2E_') ||
      ['NODE_OPTIONS', 'VITE_DEV_SERVER_URL', 'WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'].includes(key)) delete env[key];
  }
  return env;
}

module.exports = { assertNoExistingInstallation, isolatedInstallerEnvironment, selectCurrentInstaller };
