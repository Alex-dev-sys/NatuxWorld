[CmdletBinding()]
param([ValidateSet('Check', 'Prepare')][string]$Action = 'Check')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-WebViewCiEnvironment {
  param([Collections.IDictionary]$Environment)
  $required = [ordered]@{
    NATUX_EPHEMERAL_WEBVIEW_REMOVAL = 'YES'
    CI = 'true'
    GITHUB_ACTIONS = 'true'
    RUNNER_ENVIRONMENT = 'github-hosted'
    RUNNER_OS = 'Windows'
    GITHUB_REPOSITORY = 'Alex-dev-sys/NatuxWorld'
    GITHUB_EVENT_NAME = 'workflow_dispatch'
  }
  foreach ($entry in $required.GetEnumerator()) {
    if ([string]$Environment[$entry.Key] -cne $entry.Value) {
      throw "WebView2 preparation requires $($entry.Key)=$($entry.Value)."
    }
  }
}

function Assert-NoWebViewProcesses {
  if (@(Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'WebView2 processes are running. Refusing to uninstall or terminate another application.'
  }
}

function Assert-WebViewCiGuards {
  Assert-WebViewCiEnvironment ([Environment]::GetEnvironmentVariables())
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitProcess) {
    throw 'WebView2 preparation requires a native 64-bit Windows PowerShell process.'
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  try {
    if ($identity.Name.Split('\')[-1] -ine 'runneradmin') {
      throw 'WebView2 preparation requires the actual ephemeral runneradmin Windows identity.'
    }
  } finally { $identity.Dispose() }
  # Mandatory integrity SIDs are stable across display languages. Never elevate
  # from this script; the workflow must deliberately create its High token.
  $groups = @(& "$([Environment]::SystemDirectory)\whoami.exe" /groups /fo csv /nh |
    ConvertFrom-Csv -Header Name, Type, Sid, Attributes)
  if ($LASTEXITCODE -ne 0 -or @($groups | Where-Object { $_.Sid -eq 'S-1-16-12288' }).Count -ne 1) {
    throw 'WebView2 preparation requires High integrity (S-1-16-12288).'
  }
  Assert-NoWebViewProcesses
}

function ConvertTo-WebViewVersion {
  param([AllowNull()][object]$Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
  $text = [string]$Value
  $parsed = $null
  if ($text.Length -gt 64 -or $text -notmatch '^\d+\.\d+\.\d+\.\d+$' -or
    -not [version]::TryParse($text, [ref]$parsed)) {
    throw 'A WebView2 pv value is malformed; refusing to classify it as an absent runtime.'
  }
  return $parsed
}

function Get-WebViewRuntimeRoots {
  $machine = @([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86')) |
    Where-Object { $_ } | Select-Object -Unique
  foreach ($folder in $machine) {
    [pscustomobject]@{ path = Join-Path $folder 'Microsoft\EdgeWebView\Application'; systemLevel = $true }
  }
  $local = [Environment]::GetFolderPath('LocalApplicationData')
  if (-not $local) { throw 'Cannot resolve the real Windows LocalApplicationData directory.' }
  [pscustomobject]@{ path = Join-Path $local 'Microsoft\EdgeWebView\Application'; systemLevel = $false }
}

function Test-WebViewSetupPath {
  param([string]$Filename, [string]$ApplicationRoot)
  if (-not [IO.Path]::IsPathRooted($Filename) -or -not [IO.Path]::IsPathRooted($ApplicationRoot)) { return $false }
  $canonical = [IO.Path]::GetFullPath($Filename)
  $root = [IO.Path]::GetFullPath($ApplicationRoot).TrimEnd('\') + '\'
  if (-not [string]::Equals($Filename, $canonical, [StringComparison]::OrdinalIgnoreCase) -or
    -not $canonical.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  return $canonical.Substring($root.Length) -cmatch '^\d+\.\d+\.\d+\.\d+\\Installer\\setup\.exe$'
}

function Assert-NoWebViewReparsePath {
  param([string]$Filename)
  $current = Get-Item -LiteralPath $Filename -Force
  while ($null -ne $current) {
    if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'WebView2 paths must not contain symlinks or junctions.'
    }
    if ($current -is [IO.FileInfo]) { $current = $current.Directory } else { $current = $current.Parent }
  }
}

function Get-WebViewUninstallArguments {
  param([bool]$SystemLevel)
  # Chromium setup_main.cc + uninstall.cc: force-uninstall selects silent
  # uninstall. Edge's WebView product selector is --msedgewebview.
  $arguments = @('--uninstall', '--msedgewebview', '--force-uninstall', '--verbose-logging')
  if ($SystemLevel) { $arguments += '--system-level' }
  return $arguments
}

function Get-WebViewRuntimeState {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WebView2 runtime checks require Windows.' }
  # Microsoft documents HKLM WOW6432Node on x64, HKLM native on x86 and
  # HKCU for per-user installations. Read all three without changing pv.
  # https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
  $suffix = 'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  $locations = @(
    @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; name = 'HKLM'; key = "SOFTWARE\WOW6432Node\$suffix" },
    @{ hive = [Microsoft.Win32.RegistryHive]::LocalMachine; name = 'HKLM'; key = "SOFTWARE\$suffix" },
    @{ hive = [Microsoft.Win32.RegistryHive]::CurrentUser; name = 'HKCU'; key = "SOFTWARE\$suffix" }
  )
  $registry = @(foreach ($location in $locations) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($location.hive, [Microsoft.Win32.RegistryView]::Registry64)
    $key = $null
    try {
      $key = $base.OpenSubKey($location.key, $false)
      $raw = if ($null -ne $key) { $key.GetValue('pv', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { $null }
      $version = ConvertTo-WebViewVersion $raw
      [pscustomobject]@{
        path = "$($location.name):\$($location.key)"
        version = if ($null -ne $version) { $version.ToString() } else { $null }
        installed = $null -ne $version -and $version -gt [version]'0.0.0.0'
      }
    } finally {
      if ($null -ne $key) { $key.Dispose() }
      $base.Dispose()
    }
  })
  $executables = @()
  $installers = @()
  foreach ($root in @(Get-WebViewRuntimeRoots)) {
    if (-not (Test-Path -LiteralPath $root.path)) { continue }
    Assert-NoWebViewReparsePath $root.path
    $direct = Join-Path $root.path 'msedgewebview2.exe'
    if (Test-Path -LiteralPath $direct) { $executables += $direct }
    foreach ($directory in @(Get-ChildItem -LiteralPath $root.path -Directory -Force)) {
      if ($directory.Name -notmatch '^\d+\.\d+\.\d+\.\d+$') { continue }
      Assert-NoWebViewReparsePath $directory.FullName
      $binary = Join-Path $directory.FullName 'msedgewebview2.exe'
      if (Test-Path -LiteralPath $binary) {
        Assert-NoWebViewReparsePath $binary
        $executables += $binary
      }
      $setup = Join-Path $directory.FullName 'Installer\setup.exe'
      if (Test-Path -LiteralPath $setup -PathType Leaf) {
        if (-not (Test-WebViewSetupPath $setup $root.path)) { throw 'WebView2 setup is outside its canonical runtime scope.' }
        Assert-NoWebViewReparsePath $setup
        $installers += [pscustomobject]@{ path = $setup; root = $root.path; version = $directory.Name; systemLevel = $root.systemLevel }
      }
    }
  }
  $versions = @($registry | Where-Object { $_.installed } | Sort-Object { [version]$_.version } -Descending)
  return [pscustomobject]@{
    installed = $versions.Count -gt 0
    version = if ($versions.Count -gt 0) { $versions[0].version } else { $null }
    registry = $registry
    executablePaths = @($executables)
    installerCandidates = @($installers)
  }
}

function Invoke-WebViewCiPreparation {
  # Every destructive entry point repeats the guards. Dot-sourcing helpers for
  # unit tests never grants removal permission or suppresses these checks.
  Assert-WebViewCiGuards
  $before = Get-WebViewRuntimeState
  $exits = @()
  if ($before.installed -or $before.executablePaths.Count -gt 0) {
    $candidates = @($before.installerCandidates | Group-Object root | ForEach-Object {
      $_.Group | Sort-Object { [version]$_.version } -Descending | Select-Object -First 1
    })
    if ($candidates.Count -eq 0) { throw 'Runtime exists but no canonical vendor uninstaller was found.' }
    # Verify every selected executable before allowing any removal.
    foreach ($candidate in $candidates) {
      if (-not (Test-WebViewSetupPath $candidate.path $candidate.root)) { throw 'Invalid WebView2 vendor setup path.' }
      Assert-NoWebViewReparsePath $candidate.path
      $signature = Get-AuthenticodeSignature -LiteralPath $candidate.path
      if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or
        $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Microsoft Corporation') {
        throw 'WebView2 vendor setup must have valid Microsoft Corporation Authenticode.'
      }
    }
    foreach ($candidate in $candidates) {
      Assert-WebViewCiGuards
      if (-not (Test-Path -LiteralPath $candidate.path -PathType Leaf)) { continue }
      $arguments = @(Get-WebViewUninstallArguments $candidate.systemLevel)
      $process = Start-Process -FilePath $candidate.path -ArgumentList $arguments -WindowStyle Hidden -PassThru
      try {
        $null = $process.Handle
        if (-not $process.WaitForExit(120000)) { throw "WebView2 vendor uninstaller timed out (PID $($process.Id)); absence is unproven." }
        $process.Refresh()
        # Chromium util_constants.h defines UNINSTALL_SUCCESSFUL=19. Exit
        # 3010 only permits checking the actual state; it never proves absence.
        # https://chromium.googlesource.com/chromium/src/+/main/chrome/installer/util/util_constants.h
        $code = $process.ExitCode
        $exits += $code
        if ($code -notin @(0, 19, 3010)) { throw "WebView2 vendor uninstall failed with exit code $code." }
      } finally { $process.Dispose() }
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $after = Get-WebViewRuntimeState
    if (-not $after.installed -and $after.executablePaths.Count -eq 0) {
      Assert-NoWebViewProcesses
      $after | Add-Member -NotePropertyName prepared -NotePropertyValue $true
      $after | Add-Member -NotePropertyName vendorExitCodes -NotePropertyValue @($exits)
      return $after
    }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'WebView2 is still registered or its runtime executable remains. Vendor uninstall did not establish an absent runtime; no manual deletion is permitted.'
}

if ($MyInvocation.InvocationName -ne '.') {
  if ($Action -eq 'Prepare') { $state = Invoke-WebViewCiPreparation } else { $state = Get-WebViewRuntimeState }
  $state | ConvertTo-Json -Depth 8 -Compress
}
