param([switch]$ProbeOnly, [switch]$Child, [string]$ConfigPath)

$ErrorActionPreference = 'Stop'
$required = @{ OS = 'Windows_NT'; CI = 'true'; GITHUB_ACTIONS = 'true'; RUNNER_ENVIRONMENT = 'github-hosted';
    RUNNER_OS = 'Windows'; GITHUB_REPOSITORY = 'Alex-dev-sys/NatuxWorld'; GITHUB_EVENT_NAME = 'workflow_dispatch' }
foreach ($name in $required.Keys) {
    if ([Environment]::GetEnvironmentVariable($name) -cne $required[$name]) { throw "Official ephemeral upgrade CI requires $name=$($required[$name])." }
}
if ($env:GITHUB_RUN_ID -notmatch '^\d{6,20}$') { throw 'A valid GitHub run ID is required.' }
$repository = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not [string]::Equals($repository, [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The script repository must equal the GitHub workspace.'
}
$runtime = [IO.Path]::GetFullPath((Join-Path $repository 'tests/.runtime'))
$probe = Join-Path $repository 'tests/e2e/tauri-upgrade-process-probe.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()

if ($Child) {
    if ($ProbeOnly -or ($ConfigPath -and @($ConfigPath.Split([char[]]'\/') | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count)) { throw 'Child mode accepts only its canonical parent-generated configuration.' }
    if (-not $ConfigPath -or [IO.Path]::GetFullPath($ConfigPath) -notlike "$runtime\natux-upgrade-account-*\config.json") {
        throw 'Child configuration must be inside its unique repository runtime owner.'
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($config.username -notmatch '^NatuxUpTest[0-9a-f]{8}$' -or $config.sid -notmatch '^S-1-5-21-(\d+-){3}\d+$' -or
        $identity.User.Value -cne $config.sid -or [Environment]::UserName -ine $config.username) { throw 'Child identity differs from the newly created account.' }
    $profile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    if (-not [string]::Equals($profile, $config.expectedProfile, [StringComparison]::OrdinalIgnoreCase)) { throw 'Loaded profile does not belong to the new account.' }
    $roaming = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
    $local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    foreach ($folder in @($roaming, $local)) {
        if (-not $folder.StartsWith($profile + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Known application-data folder escaped the new profile.' }
    }
    $env:USERPROFILE = $profile
    $env:APPDATA = $roaming
    $env:LOCALAPPDATA = $local
    $env:TEMP = Join-Path $local 'Temp'
    $env:TMP = $env:TEMP
    foreach ($directory in @($roaming, $local, $env:TEMP)) { [void][IO.Directory]::CreateDirectory($directory) }
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Upgrade child must never be an administrator.' }
    $token = & $probe -TestProcessId $PID | ConvertFrom-Json
    if (-not $token.testToken.queryable -or $token.testToken.integritySid -cne 'S-1-16-8192' -or
        $token.testToken.elevated -ne $false) { throw 'Upgrade child requires a queryable Medium, non-elevated token.' }

    # Check GUI access without starting a launcher or changing desktop ACLs.
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NatuxUpgradeDesktopAccess {
    [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint id);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder value, uint length, out uint needed);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr OpenDesktop(string name, uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateWindowEx(uint extendedStyle, string className, string title, uint style,
        int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    [DllImport("user32.dll", SetLastError=true)] static extern bool DestroyWindow(IntPtr window);
    static string Name(IntPtr handle) {
        var value = new StringBuilder(256); uint needed;
        return GetUserObjectInformation(handle, 2, value, 512, out needed) ? value.ToString() : null;
    }
    public static string Station() { return Name(GetProcessWindowStation()); }
    public static string Desktop() { return Name(GetThreadDesktop(GetCurrentThreadId())); }
    public static bool CanOpenDefault() {
        IntPtr desktop = OpenDesktop("Default", 0, false, 0x0087);
        if (desktop == IntPtr.Zero) return false;
        try { return true; } finally { CloseDesktop(desktop); }
    }
    public static int HiddenWindowError() {
        IntPtr window = CreateWindowEx(0, "STATIC", "Natux CI access probe", 0x80000000,
            0, 0, 1, 1, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (window == IntPtr.Zero) { int error = Marshal.GetLastWin32Error(); return error == 0 ? -1 : error; }
        try { return 0; } finally { if (!DestroyWindow(window)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    }
}
'@
    $desktop = @{ station = [NatuxUpgradeDesktopAccess]::Station(); desktop = [NatuxUpgradeDesktopAccess]::Desktop();
        defaultAccessible = [NatuxUpgradeDesktopAccess]::CanOpenDefault(); hiddenWindowCreated = $false; windowError = $null }
    if ($desktop.station -ieq 'WinSta0' -and $desktop.desktop -ieq 'Default' -and $desktop.defaultAccessible) {
        $desktop.windowError = [NatuxUpgradeDesktopAccess]::HiddenWindowError()
        $desktop.hiddenWindowCreated = $desktop.windowError -eq 0
    }
    $childReceipt = [ordered]@{ sid = $identity.User.Value; username = [Environment]::UserName;
        token = $token; desktop = $desktop; profile = $profile; probeOnly = [bool]$config.probeOnly }
    $childReceipt | ConvertTo-Json -Depth 8 -Compress
    $childReceipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path (Split-Path $ConfigPath) 'child-context.json') -Encoding utf8
    if ($desktop.station -ine 'WinSta0' -or $desktop.desktop -ine 'Default' -or -not $desktop.defaultAccessible -or -not $desktop.hiddenWindowCreated) {
        throw 'The new account cannot access WinSta0/Default. No installer was started; desktop ACLs were not changed.'
    }
    # Start-Process -Credential loads HKCU but may inherit parent profile variables.
    # Rebuild the environment from machine/public configuration and this user profile.
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $keep = @('SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData', 'ALLUSERSPROFILE', 'SystemDrive', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER')
    foreach ($entry in @(Get-ChildItem Env:)) { if ($entry.Name -notin $keep) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') } }
    $env:USERPROFILE = $profile
    $env:USERNAME = $config.username
    $env:USERDOMAIN = [Environment]::MachineName
    $env:APPDATA = $roaming
    $env:LOCALAPPDATA = $local
    $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
    $env:TMP = $env:TEMP
    foreach ($directory in @($env:APPDATA, $env:LOCALAPPDATA, $env:TEMP)) { [void][IO.Directory]::CreateDirectory($directory) }
    $env:PATH = (Split-Path $config.node) + ';' + (Split-Path (Get-Process -Id $PID).Path) + ';' + $machinePath
    foreach ($property in $config.environment.PSObject.Properties) { [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process') }
    $env:NATUX_TAURI_UPGRADE_WINDOWS_ACCOUNT = $config.username
    $env:NATUX_TAURI_UPGRADE_ACCOUNT_SID = $config.sid
    if ($config.probeOnly) { exit 0 }
    $env:NATUX_TAURI_UPGRADE_ACCEPTANCE = '1'
    $env:NATUX_TAURI_UPGRADE_DEDICATED_ACCOUNT = 'YES'
    $env:NATUX_TAURI_UPGRADE_EPHEMERAL_CI = 'YES'
    Set-Location -LiteralPath $repository
    & $config.node --test tests/e2e/tauri-upgrade.test.cjs
    exit $LASTEXITCODE
}

if ([Environment]::UserName -ine 'runneradmin') { throw 'Only the official runneradmin may create this disposable account.' }
$caller = & $probe -TestProcessId $PID | ConvertFrom-Json
if (-not $caller.testToken.queryable -or -not $caller.testToken.elevated -or $caller.testToken.integritySid -cne 'S-1-16-12288') {
    throw 'Account provisioning requires the High, elevated hosted runner context.'
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
$powershell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$username = 'NatuxUpTest' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$profilesRoot = [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList' -Name ProfilesDirectory).ProfilesDirectory)
$expectedProfile = Join-Path $profilesRoot $username
if ((Get-LocalUser -Name $username -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $expectedProfile)) { throw 'Generated account/profile already exists; nothing will be replaced.' }
foreach ($directory in @($repository, (Join-Path $repository 'tests'), $runtime, $profilesRoot)) {
    if (Test-Path -LiteralPath $directory) {
        $item = Get-Item -LiteralPath $directory -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Account fixture/runtime/profile parents must be real directories, never redirected.' }
    }
}
[void][IO.Directory]::CreateDirectory($runtime)
$mode = if ($ProbeOnly) { 'probe' } else { 'actual' }
$owner = Join-Path $runtime ("natux-upgrade-account-$mode-" + [Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $owner) { throw 'Unique fixture owner already exists; refusing replacement.' }
[void][IO.Directory]::CreateDirectory($owner)
$originalAcl = Get-Acl -LiteralPath $repository
$originalSddl = $originalAcl.Sddl
$createdSid = $null
$process = $null
$aclChanged = $false
$failure = $null
$credential = $null
$password = $null
$receipt = [ordered]@{ runId = $env:GITHUB_RUN_ID; username = $username; probeOnly = [bool]$ProbeOnly;
    accountCreated = $false; childCompleted = $false; userRemoved = $false; profileRemoved = $false; workspaceAclRestored = $false }
try {
    $random = [byte[]]::new(48)
    [Security.Cryptography.RandomNumberGenerator]::Fill($random)
    $password = ConvertTo-SecureString ('aA1!' + [Convert]::ToBase64String($random)) -AsPlainText -Force
    [Array]::Clear($random, 0, $random.Length)
    $createdUser = New-LocalUser -Name $username -Password $password -AccountNeverExpires -PasswordNeverExpires -Description "Disposable Natux upgrade CI $($env:GITHUB_RUN_ID)"
    $createdSid = $createdUser.SID
    $receipt.accountCreated = $true
    $receipt.sid = $createdSid.Value
    $usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
    Add-LocalGroupMember -Group $usersGroup -Member $createdSid
    if (@(Get-LocalGroupMember -SID 'S-1-5-32-544' | Where-Object { $_.SID -eq $createdSid }).Count) { throw 'Disposable account unexpectedly belongs to Administrators.' }
    $credential = [PSCredential]::new("$([Environment]::MachineName)\$username", $password)
    $updatedAcl = Get-Acl -LiteralPath $repository
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($createdSid, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    [void]$updatedAcl.AddAccessRule($rule)
    $aclChanged = $true
    Set-Acl -LiteralPath $repository -AclObject $updatedAcl
    $environment = @{}
    $allowed = @($required.Keys) + @('GITHUB_RUN_ID', 'GITHUB_WORKSPACE', 'GITHUB_SHA',
        'NATUX_TAURI_UPGRADE_PREVIOUS_INSTALLER', 'NATUX_TAURI_UPGRADE_PREVIOUS_VERSION', 'NATUX_TAURI_UPGRADE_TARGET_INSTALLER',
        'NATUX_TAURI_UPGRADE_TARGET_HASH_FILE', 'NATUX_TAURI_UPGRADE_CHANNEL', 'NATUX_TAURI_UPGRADE_PREVIOUS_KIND')
    foreach ($name in $allowed) { $value = [Environment]::GetEnvironmentVariable($name); if ($null -ne $value) { $environment[$name] = $value } }
    $config = @{ username = $username; sid = $createdSid.Value; expectedProfile = $expectedProfile; node = $node;
        probeOnly = [bool]$ProbeOnly; environment = $environment }
    $configFile = Join-Path $owner 'config.json'
    $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configFile -Encoding utf8
    $stdout = Join-Path $owner 'stdout.log'
    $stderr = Join-Path $owner 'stderr.log'
    # PowerShell's Windows credential path ignores overrides with UseNewEnvironment.
    # Supply an explicit sanitized block, then restore the caller immediately.
    $parentEnvironment = @{}
    foreach ($entry in @(Get-ChildItem Env:)) { $parentEnvironment[$entry.Name] = $entry.Value }
    $machineEnvironment = @{}
    foreach ($name in @('SystemRoot', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData', 'ALLUSERSPROFILE', 'SystemDrive', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Machine')
        if ($null -eq $value) { $value = $parentEnvironment[$name] }
        if ($null -ne $value) { $machineEnvironment[$name] = [Environment]::ExpandEnvironmentVariables($value) }
    }
    try {
        foreach ($entry in @(Get-ChildItem Env:)) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') }
        foreach ($name in $machineEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $machineEnvironment[$name], 'Process') }
        foreach ($name in $environment.Keys) { [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process') }
        $process = Start-Process -FilePath $powershell -ArgumentList @('-NoProfile', '-NonInteractive', '-File', "`"$PSCommandPath`"", '-Child', '-ConfigPath', "`"$configFile`"") -Credential $credential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $repository -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    } finally {
        foreach ($entry in @(Get-ChildItem Env:)) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') }
        foreach ($name in $parentEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $parentEnvironment[$name], 'Process') }
        $parentEnvironment.Clear()
    }
    if (-not $process.WaitForExit(25 * 60 * 1000)) { throw 'Disposable child exceeded its bounded acceptance timeout; preserve its account/profile for recovery.' }
    $receipt.childCompleted = $true
    $receipt.childExitCode = $process.ExitCode
    if ($process.ExitCode -ne 0) { throw 'The standard-user child failed. See its token/desktop receipt and logs.' }
} catch {
    $failure = $_
    $receipt.error = $_.Exception.Message
} finally {
    try { foreach ($log in @((Join-Path $owner 'stdout.log'), (Join-Path $owner 'stderr.log'))) {
        if (Test-Path -LiteralPath $log) {
            $printed = 0
            foreach ($line in @(Get-Content -LiteralPath $log -Tail 200)) {
                $bounded = $line.Substring(0, [Math]::Min($line.Length, 4096))
                if ($printed + $bounded.Length -gt 65536) { break }
                Write-Host $bounded
                $printed += $bounded.Length
            }
        }
    } } catch { $receipt.logReadError = $_.Exception.Message }
    try {
        if ($createdSid) {
            $current = Get-LocalUser -Name $username -ErrorAction Stop
            if ($current.SID.Value -cne $createdSid.Value -or $username -notmatch '^NatuxUpTest[0-9a-f]{8}$') { throw 'Account ownership changed; cleanup refused.' }
            if ($process -and -not $process.HasExited) { throw 'Child still runs; preserve owned account/profile.' }
            $deadline = [DateTime]::UtcNow.AddSeconds(30)
            do {
                $ownedCount = 0
                foreach ($candidate in @(Get-CimInstance Win32_Process)) {
                    $candidateOwner = Invoke-CimMethod -InputObject $candidate -MethodName GetOwnerSid -ErrorAction SilentlyContinue
                    if ($candidateOwner.Sid -ceq $createdSid.Value) { $ownedCount++ }
                }
                if ($ownedCount -eq 0) { break }
                Start-Sleep -Milliseconds 500
            } while ([DateTime]::UtcNow -lt $deadline)
            if ($ownedCount -ne 0) { throw 'Owned user still has processes; preserve its profile and account.' }
            $profiles = @(Get-CimInstance Win32_UserProfile -Filter "SID='$($createdSid.Value)'")
            if ($profiles.Count -gt 1) { throw 'Ambiguous disposable profile; cleanup refused.' }
            $deadline = [DateTime]::UtcNow.AddSeconds(30)
            while ($profiles.Count -eq 1 -and $profiles[0].Loaded -and [DateTime]::UtcNow -lt $deadline) {
                Start-Sleep -Milliseconds 500
                $profiles = @(Get-CimInstance Win32_UserProfile -Filter "SID='$($createdSid.Value)'")
                if ($profiles.Count -gt 1) { throw 'Ambiguous disposable profile during unload; cleanup refused.' }
            }
            foreach ($profile in $profiles) {
                if ($profile.Loaded -or -not [string]::Equals([IO.Path]::GetFullPath($profile.LocalPath), [IO.Path]::GetFullPath($expectedProfile), [StringComparison]::OrdinalIgnoreCase) -or
                    -not [string]::Equals([IO.Directory]::GetParent($expectedProfile).FullName, [IO.Path]::GetFullPath($profilesRoot), [StringComparison]::OrdinalIgnoreCase)) { throw 'Profile is loaded or escaped its exact created owner; cleanup refused.' }
                if ((Get-Item -LiteralPath $profile.LocalPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Disposable profile is redirected; cleanup refused.' }
                Remove-CimInstance -InputObject $profile
            }
            if (@(Get-CimInstance Win32_UserProfile -Filter "SID='$($createdSid.Value)'").Count -or (Test-Path -LiteralPath $expectedProfile)) { throw 'Disposable profile cleanup did not finish.' }
            $receipt.profileRemoved = $true
            Remove-LocalUser -SID $createdSid
            if (Get-LocalUser -SID $createdSid -ErrorAction SilentlyContinue) { throw 'Disposable user cleanup did not finish.' }
            $receipt.userRemoved = $true
        }
    } catch { $receipt.cleanupError = $_.Exception.Message; if (-not $failure) { $failure = $_ } }
    try {
        if ($aclChanged) { Set-Acl -LiteralPath $repository -AclObject $originalAcl }
        if ((Get-Acl -LiteralPath $repository).Sddl -cne $originalSddl) { throw 'Workspace ACL did not return to its exact original descriptor.' }
        $receipt.workspaceAclRestored = $true
    } catch { $receipt.aclError = $_.Exception.Message; if (-not $failure) { $failure = $_ } }
    if ($password) { $password.Dispose() }
    $credential = $null
    $receipt.success = -not [bool]$failure
    $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runtime "tauri-upgrade-account-$mode-result.json") -Encoding utf8
}
if ($failure) { throw $failure }
