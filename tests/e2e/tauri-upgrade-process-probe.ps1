param(
    [ValidateRange(1, 2147483647)]
    [int]$TestProcessId = $PID,
    [string]$InstallDirectory
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This read-only token probe requires Windows.' }

$ownedDirectory = $null
if ($InstallDirectory) {
    if (-not [IO.Path]::IsPathRooted($InstallDirectory) -or $InstallDirectory -notmatch '^[A-Za-z]:[\\/]') {
        throw 'InstallDirectory must be an absolute local Windows path.'
    }
    if (@($InstallDirectory.Split([char[]]'\/') | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count) {
        throw 'InstallDirectory must not contain traversal.'
    }
    $ownedDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd([char[]]'\/')
    $owner = [IO.Directory]::GetParent($ownedDirectory)
    $temporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
    if ([IO.Path]::GetFileName($ownedDirectory) -cne 'app' -or
        $owner.Name -notmatch '^natux-tauri-upgrade-test-[A-Za-z0-9_-]+$' -or
        -not [string]::Equals($owner.Parent.FullName, $temporary, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'InstallDirectory must be app under this account temporary natux-tauri-upgrade-test owner.'
    }
    $ancestor = $ownedDirectory
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'Diagnostic ownership must not traverse a file, junction or symlink.'
            }
        }
        $parent = [IO.Directory]::GetParent($ancestor)
        $ancestor = if ($parent) { $parent.FullName } else { $null }
    }
}

if (-not ('NatuxUpgradeProcessProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public sealed class NatuxUpgradeToken {
    public int pid;
    public bool queryable;
    public bool? elevated;
    public int? elevationType;
    public bool? restricted;
    public string integritySid;
    public uint? sessionId;
    public int? errorCode;
}

public static class NatuxUpgradeProcessProbe {
    const uint QueryLimitedInformation = 0x1000;
    const uint TokenQuery = 0x0008;
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool ProcessIdToSessionId(uint processId, out uint sessionId);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int returned);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool IsTokenRestricted(IntPtr token);
    [DllImport("kernel32.dll", EntryPoint="SetLastError")]
    static extern void ClearLastError(uint error);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr text);
    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("user32.dll")]
    public static extern IntPtr GetShellWindow();
    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    public static string ImagePath(int pid) {
        IntPtr process = OpenProcess(QueryLimitedInformation, false, pid);
        if (process == IntPtr.Zero) return null;
        try {
            uint length = 32768;
            var name = new StringBuilder((int)length);
            return QueryFullProcessImageName(process, 0, name, ref length) ? name.ToString() : null;
        } finally { CloseHandle(process); }
    }

    public static NatuxUpgradeToken Token(int pid) {
        var result = new NatuxUpgradeToken { pid = pid, queryable = false };
        uint session;
        if (ProcessIdToSessionId((uint)pid, out session)) result.sessionId = session;
        IntPtr process = IntPtr.Zero, token = IntPtr.Zero, buffer = IntPtr.Zero, sidText = IntPtr.Zero;
        try {
            process = OpenProcess(QueryLimitedInformation, false, pid);
            if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            if (!OpenProcessToken(process, TokenQuery, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
            buffer = Marshal.AllocHGlobal(4);
            int returned;
            if (!GetTokenInformation(token, 20, buffer, 4, out returned)) throw new Win32Exception(Marshal.GetLastWin32Error());
            result.elevated = Marshal.ReadInt32(buffer) != 0;
            if (!GetTokenInformation(token, 18, buffer, 4, out returned)) throw new Win32Exception(Marshal.GetLastWin32Error());
            result.elevationType = Marshal.ReadInt32(buffer);
            ClearLastError(0);
            bool restricted = IsTokenRestricted(token);
            int restrictionError = Marshal.GetLastWin32Error();
            if (!restricted && restrictionError != 0) throw new Win32Exception(restrictionError);
            result.restricted = restricted;
            Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero;
            int needed;
            GetTokenInformation(token, 25, IntPtr.Zero, 0, out needed);
            if (needed <= 0 || needed > 65536) throw new Win32Exception(13);
            buffer = Marshal.AllocHGlobal(needed);
            if (!GetTokenInformation(token, 25, buffer, needed, out returned)) throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr sid = Marshal.ReadIntPtr(buffer);
            if (!ConvertSidToStringSid(sid, out sidText)) throw new Win32Exception(Marshal.GetLastWin32Error());
            result.integritySid = Marshal.PtrToStringUni(sidText);
            result.queryable = true;
        } catch (Win32Exception error) { result.errorCode = error.NativeErrorCode; }
        finally {
            if (sidText != IntPtr.Zero) LocalFree(sidText);
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if (token != IntPtr.Zero) CloseHandle(token);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
        return result;
    }
}
'@
}

$testToken = [NatuxUpgradeProcessProbe]::Token($TestProcessId)
$shellWindow = [NatuxUpgradeProcessProbe]::GetShellWindow()
$shellProcessId = [uint32]0
$shell = [ordered]@{ present = $false; pid = $null; token = $null }
if ($shellWindow -ne [IntPtr]::Zero) {
    [void][NatuxUpgradeProcessProbe]::GetWindowThreadProcessId($shellWindow, [ref]$shellProcessId)
    if ($shellProcessId -gt 0) {
        $shell.present = $true
        $shell.pid = $shellProcessId
        $shell.token = [NatuxUpgradeProcessProbe]::Token([int]$shellProcessId)
    }
}

$ownedProcesses = @()
$unqueryableCandidateCount = 0
if ($ownedDirectory) {
    $candidates = @([Diagnostics.Process]::GetProcessesByName('natux-world-launcher-native'))
    try {
        $unqueryableCandidateCount = [Math]::Max(0, $candidates.Count - 16)
        foreach ($candidate in @($candidates | Select-Object -First 16)) {
            $candidateProcessId = $candidate.Id
            $image = [NatuxUpgradeProcessProbe]::ImagePath($candidateProcessId)
            if (-not $image) { $unqueryableCandidateCount++; continue }
            if (-not $image.StartsWith($ownedDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
                [IO.Path]::GetFileName($image) -ine 'natux-world-launcher-native.exe') { continue }
            $ownedProcesses += [ordered]@{ pid = $candidateProcessId; executable = $image; token = [NatuxUpgradeProcessProbe]::Token($candidateProcessId) }
        }
    } finally { foreach ($candidate in $candidates) { $candidate.Dispose() } }
}

[ordered]@{ testToken = $testToken; shell = $shell; ownedProcesses = @($ownedProcesses);
    unqueryableCandidateCount = $unqueryableCandidateCount } | ConvertTo-Json -Depth 6 -Compress
