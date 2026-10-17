param(
  [Parameter(Mandatory = $true)][ValidateSet('Extract', 'Dialog', 'Inspect', 'Stop', 'Snapshot')][string]$Action,
  [Parameter(Mandatory = $true)][string]$OwnerRoot,
  [string]$Archive,
  [int]$ProcessId,
  [ValidateSet(6, 7)][int]$ButtonId = 7
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-CanonicalPath([string]$Filename) {
  if (-not [IO.Path]::IsPathRooted($Filename) -or [IO.Path]::GetFullPath($Filename) -ine $Filename) { throw 'Path must be canonical and absolute.' }
  $item = Get-Item -LiteralPath $Filename -Force
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected paths are excluded.' }
    if ($item -is [IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
  }
}

function Assert-Owner {
  Assert-CanonicalPath $OwnerRoot
  $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
  if ([IO.Path]::GetDirectoryName($OwnerRoot) -ine $parent -or
      [IO.Path]::GetFileName($OwnerRoot) -notmatch '^natux-portable-webview-[A-Za-z0-9-]+$') { throw 'Only the owned direct temporary fixture is allowed.' }
}

function Assert-CiUi {
  $required = @{ NATUX_PORTABLE_WEBVIEW_ACCEPTANCE = '1'; CI = 'true'; GITHUB_ACTIONS = 'true'
    RUNNER_ENVIRONMENT = 'github-hosted'; RUNNER_OS = 'Windows'
    GITHUB_REPOSITORY = 'Alex-dev-sys/NatuxWorld'; GITHUB_EVENT_NAME = 'workflow_dispatch' }
  foreach ($entry in $required.GetEnumerator()) {
    if ([Environment]::GetEnvironmentVariable($entry.Key) -cne $entry.Value) { throw "UI requires $($entry.Key)=$($entry.Value)." }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  try { if ($identity.Name.Split('\')[-1] -ine 'runneradmin') { throw 'UI requires the actual ephemeral runneradmin identity.' } }
  finally { $identity.Dispose() }
  $groups = @(whoami.exe /groups /fo csv /nh | ConvertFrom-Csv -Header Name,Type,Sid,Attributes)
  if ($LASTEXITCODE -ne 0 -or @($groups | Where-Object { $_.Sid -eq 'S-1-16-8192' }).Count -ne 1) { throw 'UI must run at Medium integrity.' }
}

function Expand-OwnedPortable {
  Assert-CanonicalPath $Archive
  if (-not (Test-Path -LiteralPath $Archive -PathType Leaf) -or (Get-Item -LiteralPath $Archive).Length -gt 350MB) { throw 'Portable ZIP must be a bounded regular file.' }
  $destination = Join-Path $OwnerRoot 'app'
  if (Test-Path -LiteralPath $destination) { throw 'Extraction destination must not exist.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  $limits = @{
    'natux-world-launcher-native.exe' = 300MB; 'natux-lock/natux-lock-agent.jar' = 20MB
    'start-portable.ps1' = 64KB; 'Start NATUX WORLD.cmd' = 4KB; 'natux-portable.json' = 4KB
  }
  $stream = [IO.File]::Open($Archive, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $zip = $null
  try {
    $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read)
    if ($zip.Entries.Count -lt 5 -or $zip.Entries.Count -gt 16) { throw 'Unexpected ZIP entry count.' }
    $seen = @{}; $files = @(); $total = 0L
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName
      if ($name -match '\\|:|^/|[\x00-\x1f]' -or @($name.Split('/') | Where-Object { $_ -in @('.', '..') }).Count -gt 0) { throw 'ZIP path traversal or noncanonical name.' }
      if ($seen.ContainsKey($name)) { throw 'Duplicate or case-colliding ZIP entry.' }
      $seen[$name] = $true
      if ((([int64]$entry.ExternalAttributes -band 4026531840L) -eq 2684354560L) -or
          ($entry.ExternalAttributes -band 1024) -ne 0) { throw 'ZIP symlinks and reparse points are excluded.' }
      if ($name.EndsWith('/')) {
        if ($name -cne 'natux-lock/' -or $entry.Length -ne 0) { throw 'Unexpected ZIP directory.' }
        continue
      }
      if (-not $limits.ContainsKey($name) -or @($limits.Keys | Where-Object { $_ -ceq $name }).Count -ne 1) { throw 'Unexpected ZIP file.' }
      if ($entry.Length -le 0 -or $entry.Length -gt $limits[$name]) { throw 'ZIP file exceeds its bound or is empty.' }
      $total += $entry.Length
      if ($total -gt 350MB) { throw 'ZIP expansion is oversized.' }
      $files += $name
      $resolved = [IO.Path]::GetFullPath((Join-Path $destination $name.Replace('/', '\')))
      if (-not $resolved.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP entry escaped owner.' }
    }
    if ($files.Count -ne $limits.Count) { throw 'ZIP must contain the five exact production portable files.' }
    $null = [IO.Directory]::CreateDirectory($destination)
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName.EndsWith('/')) { continue }
      $output = Join-Path $destination $entry.FullName.Replace('/', '\')
      $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output))
      $inputStream = $entry.Open()
      $outputStream = $null
      try {
        $outputStream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $inputStream.CopyTo($outputStream)
      } finally {
        if ($null -ne $outputStream) { $outputStream.Dispose() }
        $inputStream.Dispose()
      }
    }
    return @{ extracted = $true; fileCount = $files.Count; expandedBytes = $total }
  } finally { if ($null -ne $zip) { $zip.Dispose() }; $stream.Dispose() }
}

function Get-ScopedProcessEvidence([object]$RootProcess, [object[]]$AllProcesses) {
  $seen = @{}; $seen[[int]$RootProcess.ProcessId] = $RootProcess
  for ($depth = 0; $depth -lt 16; $depth++) {
    $next = @($AllProcesses | Where-Object {
      -not $seen.ContainsKey([int]$_.ProcessId) -and $seen.ContainsKey([int]$_.ParentProcessId) -and
      $_.CreationDate -ge $seen[[int]$_.ParentProcessId].CreationDate
    })
    if ($next.Count -eq 0) { break }
    foreach ($child in $next) { $seen[[int]$child.ProcessId] = $child }
    if ($seen.Count -gt 128) { throw 'Owned process evidence exceeded its bound.' }
  }
  @($seen.Values | Sort-Object ProcessId | ForEach-Object {
    @{ processId = $_.ProcessId; parentProcessId = $_.ParentProcessId; executable = $_.ExecutablePath }
  })
}

$dialogType = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NatuxPortableDialog {
  public const string Prompt = "NATUX WORLD requires Microsoft WebView2. Download and install it now?";
  private delegate bool Callback(IntPtr hwnd, IntPtr state);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback, IntPtr state);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr hwnd, Callback callback, IntPtr state);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] private static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
  [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  private static string Text(IntPtr hwnd, bool kind) {
    var buffer = new StringBuilder(1024);
    if (kind) GetClassName(hwnd, buffer, buffer.Capacity); else GetWindowText(hwnd, buffer, buffer.Capacity);
    return buffer.ToString();
  }
  public static bool Matches(int expected, int actual, string title, string kind, string prompt, int id) {
    return expected > 0 && actual == expected && title == "NATUX WORLD" && kind == "#32770" && prompt == Prompt && (id == 6 || id == 7);
  }
  public static bool SnapshotMatches(int expected, int actual, string title, string kind) {
    return expected > 0 && actual == expected && title == "NATUX WORLD" && kind == "#32770";
  }
  public sealed class WindowEvidence {
    public string title; public string windowClass; public long windowHandle;
    public bool active; public string[] staticTexts; public int[] buttonIds;
  }
  public static WindowEvidence[] Snapshot(int pid) {
    var windows = new List<WindowEvidence>();
    EnumWindows(delegate(IntPtr window, IntPtr state) {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (!SnapshotMatches(pid, (int)owner, Text(window, false), Text(window, true))) return true;
      if (windows.Count >= 8) throw new InvalidOperationException("Owned dialog evidence exceeded its bound.");
      var texts = new List<string>(); var buttons = new List<int>();
      EnumChildWindows(window, delegate(IntPtr child, IntPtr ignored) {
        uint childOwner; GetWindowThreadProcessId(child, out childOwner);
        if (childOwner != pid || GetParent(child) != window) return true;
        if (texts.Count + buttons.Count >= 32) return false;
        if (Text(child, true) == "Static") texts.Add(Text(child, false));
        if (Text(child, true) == "Button") buttons.Add(GetDlgCtrlID(child));
        return true;
      }, IntPtr.Zero);
      windows.Add(new WindowEvidence { title = Text(window, false), windowClass = Text(window, true),
        windowHandle = window.ToInt64(), active = GetForegroundWindow() == window,
        staticTexts = texts.ToArray(), buttonIds = buttons.ToArray() });
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
  public static bool Click(int pid, int id) {
    IntPtr dialog = IntPtr.Zero;
    EnumWindows(delegate(IntPtr window, IntPtr state) {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner != pid || !IsWindowVisible(window) || Text(window, false) != "NATUX WORLD" || Text(window, true) != "#32770") return true;
      bool prompt = false;
      EnumChildWindows(window, delegate(IntPtr child, IntPtr ignored) {
        if (Text(child, true) == "Static" && Text(child, false) == Prompt) prompt = true;
        return true;
      }, IntPtr.Zero);
      if (!prompt) return true;
      if (dialog != IntPtr.Zero) throw new InvalidOperationException("Ambiguous owned prerequisite dialog.");
      dialog = window; return true;
    }, IntPtr.Zero);
    if (dialog == IntPtr.Zero) return false;
    var button = GetDlgItem(dialog, id);
    uint buttonOwner; GetWindowThreadProcessId(button, out buttonOwner);
    if (!Matches(pid, (int)buttonOwner, Text(dialog, false), Text(dialog, true), Prompt, id) ||
        button == IntPtr.Zero || GetParent(button) != dialog || GetDlgCtrlID(button) != id || Text(button, true) != "Button" ||
        !IsWindowVisible(button) || !IsWindowEnabled(button)) throw new InvalidOperationException("Owned dialog button could not be verified.");
    if (!PostMessage(button, 0x00F5, IntPtr.Zero, IntPtr.Zero)) throw new InvalidOperationException("Could not click owned prerequisite button.");
    var deadline = DateTime.UtcNow.AddSeconds(5);
    while (IsWindow(dialog) && DateTime.UtcNow < deadline) System.Threading.Thread.Sleep(50);
    if (IsWindow(dialog)) throw new InvalidOperationException("Owned prerequisite dialog did not close within 5 seconds after BM_CLICK.");
    return true;
  }
}
'@

if ($MyInvocation.InvocationName -eq '.') { return }
Assert-Owner
if ($Action -eq 'Extract') { Expand-OwnedPortable | ConvertTo-Json -Compress; exit 0 }
Assert-CiUi
$executable = Join-Path $OwnerRoot 'app\natux-world-launcher-native.exe'
Assert-CanonicalPath $executable
if ($Action -in @('Dialog', 'Snapshot')) {
  if ($ProcessId -le 0) { throw 'Owned helper PID is required.' }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
  if ($Action -eq 'Snapshot' -and $null -eq $process) {
    @{ helperPresent = $false; processId = $ProcessId; dialogs = @(); processes = @() } | ConvertTo-Json -Compress
    exit 0
  }
  $expectedPowerShell = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
  $expectedScript = Join-Path $OwnerRoot 'app\start-portable.ps1'
  if ($null -eq $process -or $process.ExecutablePath -ine $expectedPowerShell -or
      $process.CommandLine.IndexOf($expectedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
      $process.CommandLine -notmatch '(?i)(?:^|\s)-STA(?:\s|$)') { throw 'PID is not this owned portable PowerShell helper.' }
  Add-Type -TypeDefinition $dialogType
  if ($Action -eq 'Snapshot') {
    $all = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,ExecutablePath,CreationDate)
    @{ helperPresent = $true; processId = $ProcessId; dialogs = @([NatuxPortableDialog]::Snapshot($ProcessId))
      processes = @(Get-ScopedProcessEvidence $process $all) } | ConvertTo-Json -Depth 6 -Compress
    exit 0
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    if ([NatuxPortableDialog]::Click($ProcessId, $ButtonId)) {
      @{ clicked = $true; dialogClosed = $true; processId = $ProcessId; buttonId = $ButtonId; title = 'NATUX WORLD'; windowClass = '#32770'; prompt = [NatuxPortableDialog]::Prompt } | ConvertTo-Json -Compress
      exit 0
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Verified owned prerequisite dialog did not appear.'
}
$processes = @(Get-CimInstance Win32_Process -Filter "Name = 'natux-world-launcher-native.exe'" |
  Where-Object { $_.ExecutablePath -ieq $executable })
if ($Action -eq 'Stop') {
  foreach ($process in $processes) {
    # Kill only an exact owned native executable and its descendant WebViews.
    & taskkill.exe /PID $process.ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { throw 'Owned process tree did not stop.' }
  }
}
$remaining = @(Get-CimInstance Win32_Process -Filter "Name = 'natux-world-launcher-native.exe'" |
  Where-Object { $_.ExecutablePath -ieq $executable } |
  ForEach-Object { @{ processId = $_.ProcessId; parentProcessId = $_.ParentProcessId; executable = $_.ExecutablePath } })
ConvertTo-Json -InputObject $remaining -Compress
