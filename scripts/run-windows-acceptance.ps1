param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('packaged', 'portable', 'installed', 'electron-migration', 'webview-bootstrap', 'signed-upgrade', 'portable-webview')]
    [string]$Suite,
    [switch]$InMediumProcess
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $env:CI -ne 'true' -or
    $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'This wrapper is only for ephemeral hosted Windows CI. Run the normal npm test command locally.'
}

# WebView2 150+ ignores debugger environment overrides in elevated hosts.
# Keep the publishable binary unchanged and exercise its ordinary user context.
# https://github.com/tauri-apps/wry/issues/1782
$groups = & whoami.exe /groups /fo csv /nh
if ($LASTEXITCODE -ne 0) { throw 'Could not determine the Windows process integrity level.' }
$medium = @($groups | ConvertFrom-Csv -Header Name, Kind, Sid, Attributes |
    Where-Object { $_.Sid -eq 'S-1-16-8192' }).Count -eq 1

if (-not $medium) {
    if ($InMediumProcess) { throw 'The acceptance child did not enter Medium integrity.' }
    $gsudo = (Get-Command gsudo.exe -ErrorAction Stop).Source
    $powershell = (Get-Command pwsh.exe -ErrorAction Stop).Source
    & $gsudo --integrity Medium --direct $powershell -NoProfile -File $PSCommandPath -Suite $Suite -InMediumProcess
    exit $LASTEXITCODE
}

Write-Host "Running $Suite acceptance at verified Medium integrity."
$tests = @{
    'packaged' = 'tests/e2e/tauri-packaged.test.cjs'
    'portable' = 'tests/e2e/tauri-portable.test.cjs'
    'installed' = 'tests/e2e/tauri-installed.test.cjs'
    'electron-migration' = 'tests/e2e/tauri-electron-migration.test.cjs'
    'webview-bootstrap' = 'tests/e2e/tauri-webview-bootstrap.test.cjs'
    'signed-upgrade' = 'tests/e2e/tauri-upgrade.test.cjs'
    'portable-webview' = 'tests/e2e/tauri-portable-webview.test.cjs'
}
$repository = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repository
try {
    & node.exe --test $tests[$Suite]
    $result = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $result
