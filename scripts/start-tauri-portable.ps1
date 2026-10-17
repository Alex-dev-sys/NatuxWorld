param([switch]$CheckRuntimeOnly)
$ErrorActionPreference = 'Stop'

function Get-WebViewRuntimeVersion {
    $runtimeId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach ($key in @(
        "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$runtimeId",
        "HKLM:\Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeId",
        "HKLM:\Software\Microsoft\EdgeUpdate\Clients\$runtimeId"
    )) {
        $raw = (Get-ItemProperty -LiteralPath $key -Name pv -ErrorAction SilentlyContinue).pv
        $version = $null
        if ([Version]::TryParse([string]$raw, [ref]$version) -and $version -gt [Version]'0.0.0.0') {
            return $version.ToString()
        }
    }
    return $null
}

function Assert-MicrosoftBootstrapperSignature {
    param([string]$Path)
    # PowerShell 7 callers can leave incompatible modules in inherited PSModulePath.
    $inheritedModulePath = $env:PSModulePath
    try {
        $env:PSModulePath = Join-Path $PSHOME 'Modules'
        $securityModule = Import-Module -Name (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -PassThru -ErrorAction Stop
    } finally {
        $env:PSModulePath = $inheritedModulePath
    }
    $signature = & $securityModule.ExportedCommands['Get-AuthenticodeSignature'] -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|, )O=Microsoft Corporation(?:,|$)') {
        throw 'Microsoft WebView2 installer signature could not be verified.'
    }
}

if ($CheckRuntimeOnly) {
    @{ available = [bool](Get-WebViewRuntimeVersion) } | ConvertTo-Json -Compress
    exit 0
}

try {
    $executable = Join-Path $PSScriptRoot 'natux-world-launcher-native.exe'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Portable launcher executable is missing.' }
    if (-not (Get-WebViewRuntimeVersion)) {
        Add-Type -AssemblyName System.Windows.Forms
        $choice = [System.Windows.Forms.MessageBox]::Show(
            'NATUX WORLD requires Microsoft WebView2. Download and install it now?',
            'NATUX WORLD', 'YesNo', 'Question')
        if ($choice -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
        $temporaryPath = Join-Path ([System.IO.Path]::GetTempPath()) ('natux-webview-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temporaryPath | Out-Null
        try {
            $bootstrapper = Join-Path $temporaryPath 'MicrosoftEdgeWebView2Setup.exe'
            Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper -TimeoutSec 60 -UseBasicParsing
            Assert-MicrosoftBootstrapperSignature -Path $bootstrapper
            $installer = Start-Process -FilePath $bootstrapper -ArgumentList '/silent', '/install' -Wait -PassThru -WindowStyle Hidden
            if ($installer.ExitCode -notin @(0, 3010) -or -not (Get-WebViewRuntimeVersion)) {
                throw 'Microsoft WebView2 installation did not complete. Try starting the launcher again after restarting Windows.'
            }
        } finally {
            $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryPath)
            $temporaryParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
            if ([System.IO.Path]::GetDirectoryName($resolvedTemporary) -eq $temporaryParent) {
                Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
            }
        }
    }
    # This is the interactive application the user launched, not a background helper.
    Start-Process -FilePath $executable -WorkingDirectory $PSScriptRoot
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'NATUX WORLD', 'OK', 'Error') | Out-Null
    exit 1
}
