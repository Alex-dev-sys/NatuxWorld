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

async function assertNoExistingInstallation(productName = 'NATUX WORLD') {
  const literal = productName.replaceAll("'", "''");
  const script = `
    $product = '${literal}'
    $roots = @(
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    )
    $found = @($roots | ForEach-Object {
      Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | ForEach-Object {
        $registration = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
        if ($registration.DisplayName -and $registration.DisplayName.StartsWith($product, [StringComparison]::OrdinalIgnoreCase)) { 1 }
      }
    })
    $found.Count
  `;
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 15_000 });
  assert.match(stdout.trim(), /^\d+$/);
  assert.equal(Number(stdout.trim()), 0,
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
