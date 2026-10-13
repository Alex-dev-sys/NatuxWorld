[CmdletBinding()]
param(
    [string]$Root = (Join-Path (Join-Path $env:PUBLIC 'Documents') 'natux-tauri-test-server'),
    [ValidateRange(1024, 65535)]
    [int]$Port = 25567,
    [string]$TestUsername,
    [string]$TestUuid
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$minecraftVersion = '1.21.1'
$authlibUrl = 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.7/authlib-injector-1.2.7.jar'
$authlibSha1 = '9a401b2cdb97bf49e5c447dcfb0325979168b672'
$authlibSize = 344477
$apiHeaders = @{
    Accept = 'application/json'
    'User-Agent' = 'NatuxWorld-Tauri-TestSetup/1.0 (https://github.com/Alex-dev-sys/NatuxWorld)'
}

function Write-Utf8File([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Download-VerifiedFile([string]$Url, [string]$Path, [string]$Algorithm, [string]$ExpectedHash, [long]$ExpectedSize) {
    if (Test-Path -LiteralPath $Path) {
        $existing = Get-Item -LiteralPath $Path
        $hash = (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
        if ($existing.Length -ne $ExpectedSize -or $hash -ne $ExpectedHash.ToLowerInvariant()) {
            throw "Existing staging artifact failed integrity verification: $Path"
        }
        return
    }

    $partial = "$Path.$([guid]::NewGuid().ToString('N')).part"
    try {
        Invoke-WebRequest -Uri $Url -Headers $apiHeaders -OutFile $partial -UseBasicParsing -TimeoutSec 120
        $download = Get-Item -LiteralPath $partial
        $hash = (Get-FileHash -LiteralPath $partial -Algorithm $Algorithm).Hash.ToLowerInvariant()
        if ($download.Length -ne $ExpectedSize -or $hash -ne $ExpectedHash.ToLowerInvariant()) {
            throw "Downloaded staging artifact failed integrity verification: $Url"
        }
        Move-Item -LiteralPath $partial -Destination $Path
    } finally {
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    }
}

function Read-Properties([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*#' -or $line -notmatch '^([^=]+)=(.*)$') { continue }
        $values[$Matches[1]] = $Matches[2]
    }
    return $values
}

function Get-JavaVersion([string]$Path) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        return (& $Path -version 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

if (($TestUsername -and -not $TestUuid) -or ($TestUuid -and -not $TestUsername)) {
    throw 'Provide both -TestUsername and -TestUuid, or leave both empty until the dedicated account exists.'
}
if ($TestUsername -and $TestUsername -notmatch '^[A-Za-z0-9_]{3,16}$') {
    throw 'TestUsername must be a valid Minecraft username.'
}
if ($TestUuid) {
    $parsedUuid = [guid]::Empty
    if (-not [guid]::TryParse($TestUuid, [ref]$parsedUuid)) { throw 'TestUuid must be a valid account UUID.' }
    $TestUuid = $parsedUuid.ToString('D')
}

$rootPath = [System.IO.Path]::GetFullPath($Root)
$rootName = [System.IO.Path]::GetFileName($rootPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar))
if ($rootName -notmatch 'test') { throw 'The staging directory name must contain "test".' }
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($rootPath.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $rootPath.StartsWith($repositoryRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep generated server files outside the repository.'
}

$markerPath = Join-Path $rootPath '.natux-tauri-test-server.json'
if (Test-Path -LiteralPath $rootPath) {
    if (-not (Test-Path -LiteralPath $markerPath)) {
        $existingItems = @(Get-ChildItem -LiteralPath $rootPath -Force)
        if ($existingItems.Count -gt 0) { throw 'Refusing to reuse a non-empty directory without this scripts marker.' }
    }
} else {
    New-Item -ItemType Directory -Path $rootPath | Out-Null
}

$versionResponse = Invoke-RestMethod -Uri "https://fill.papermc.io/v3/projects/paper/versions/$minecraftVersion/builds" -Headers $apiHeaders -TimeoutSec 30
$stableBuild = @($versionResponse | Where-Object { $_.channel -eq 'STABLE' } | Select-Object -First 1)
if ($stableBuild.Count -ne 1) { throw "Paper has no stable build for Minecraft $minecraftVersion." }
$paper = $stableBuild[0].downloads.'server:default'
if (-not $paper.url -or $paper.url -notmatch '^https://fill-data\.papermc\.io/') {
    throw 'Paper returned an unexpected download host.'
}
$jreResponse = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/feature_releases/21/ga?architecture=x64&image_type=jre&jvm_impl=hotspot&os=windows&page_size=1&project=jdk&vendor=eclipse' -Headers $apiHeaders -TimeoutSec 30
$jreRelease = @($jreResponse | Where-Object { $_.vendor -eq 'eclipse' -and $_.version_data.major -eq 21 } | Select-Object -First 1)
if ($jreRelease.Count -ne 1) { throw 'Adoptium did not return a matching Temurin 21 release.' }
$jreBinary = @($jreRelease[0].binaries | Where-Object { $_.architecture -eq 'x64' -and $_.image_type -eq 'jre' -and $_.jvm_impl -eq 'hotspot' -and $_.os -eq 'windows' -and $_.project -eq 'jdk' } | Select-Object -First 1)
if ($jreBinary.Count -ne 1) { throw 'Adoptium did not return a Windows x64 Temurin JRE.' }
$jre = $jreBinary[0].package
if (-not $jre.link -or $jre.link -notmatch '^https://github\.com/adoptium/temurin21-binaries/') {
    throw 'Adoptium returned an unexpected JRE download host.'
}

$marker = [ordered]@{
    kind = 'natux-tauri-live-test-server'
    minecraftVersion = $minecraftVersion
    paperBuild = [int]$stableBuild[0].id
    paperSha256 = $paper.checksums.sha256
    javaVersion = $jreRelease.version_data.semver
    javaSha256 = $jre.checksum
    authlibInjectorVersion = '1.2.7'
    authlibInjectorSha1 = $authlibSha1
    port = $Port
    yggdrasilApi = 'https://vibestudy.ru/api/yggdrasil'
    testUsername = $TestUsername
    testUuid = $TestUuid
}
if (Test-Path -LiteralPath $markerPath) {
    $oldMarker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ($oldMarker.kind -ne $marker.kind -or $oldMarker.paperSha256 -ne $marker.paperSha256 -or
        $oldMarker.javaSha256 -ne $marker.javaSha256 -or $oldMarker.port -ne $marker.port) {
        throw 'Existing staging server marker differs; use a new test directory instead.'
    }
    $oldUsernameProperty = $oldMarker.PSObject.Properties['testUsername']
    $oldUuidProperty = $oldMarker.PSObject.Properties['testUuid']
    $oldUsername = if ($oldUsernameProperty) { $oldUsernameProperty.Value } else { $null }
    $oldUuid = if ($oldUuidProperty) { $oldUuidProperty.Value } else { $null }
    if ($oldUsername -and $TestUsername -and ($oldUsername -ne $TestUsername -or $oldUuid -ne $TestUuid)) {
        throw 'A different test account is already bound to this staging directory.'
    }
    if (-not $TestUsername -and $oldUsername) {
        $marker.testUsername = $oldUsername
        $marker.testUuid = $oldUuid
    }
} else {
    Write-Utf8File $markerPath ($marker | ConvertTo-Json -Depth 4)
}

$paperJar = Join-Path $rootPath 'paper-server.jar'
$authlibJar = Join-Path $rootPath 'authlib-injector-1.2.7.jar'
Download-VerifiedFile $paper.url $paperJar 'SHA256' $paper.checksums.sha256 ([long]$paper.size)
Download-VerifiedFile $authlibUrl $authlibJar 'SHA1' $authlibSha1 $authlibSize
$jreArchive = Join-Path $rootPath 'temurin-21-jre.zip'
Download-VerifiedFile $jre.link $jreArchive 'SHA256' $jre.checksum ([long]$jre.size)
$runtimePath = Join-Path $rootPath 'java-21'
$javaMatches = @()
if (Test-Path -LiteralPath $runtimePath) {
    $javaMatches = @(Get-ChildItem -LiteralPath $runtimePath -Filter java.exe -File -Recurse)
}
if ($javaMatches.Count -eq 0) {
    if (Test-Path -LiteralPath $runtimePath) {
        $runtimeFiles = @(Get-ChildItem -LiteralPath $runtimePath -Force)
        if ($runtimeFiles.Count -gt 0) { throw 'The Java 21 extraction directory contains unrecognized files.' }
    } else {
        New-Item -ItemType Directory -Path $runtimePath | Out-Null
    }
    Expand-Archive -LiteralPath $jreArchive -DestinationPath $runtimePath
    $javaMatches = @(Get-ChildItem -LiteralPath $runtimePath -Filter java.exe -File -Recurse)
}
if ($javaMatches.Count -ne 1) { throw 'The verified Temurin archive did not contain exactly one Java executable.' }
$javaPath = $javaMatches[0].FullName
if ((Get-JavaVersion $javaPath) -notmatch 'version "21(?:\.|"|\+)') {
    throw 'The extracted Temurin runtime is not Java 21.'
}

$expectedProperties = @{
    'server-ip' = '127.0.0.1'
    'server-port' = "$Port"
    'online-mode' = 'true'
    'enforce-secure-profile' = 'true'
    'white-list' = 'true'
    'enforce-whitelist' = 'true'
    'max-players' = '1'
    'enable-rcon' = 'false'
    'enable-query' = 'false'
}
$propertiesPath = Join-Path $rootPath 'server.properties'
if (-not (Test-Path -LiteralPath $propertiesPath)) {
    $propertyLines = @('motd=NATUX test server - localhost') + @(
        $expectedProperties.GetEnumerator() | Sort-Object Key | ForEach-Object { "$($_.Key)=$($_.Value)" }
    )
    Write-Utf8File $propertiesPath ($propertyLines -join "`n")
} else {
    $actualProperties = Read-Properties $propertiesPath
    foreach ($key in $expectedProperties.Keys) {
        if ($actualProperties[$key] -ne $expectedProperties[$key]) {
            throw "Existing server.properties is not isolated as required ($key). Stop and inspect $propertiesPath."
        }
    }
}

$eulaPath = Join-Path $rootPath 'eula.txt'
if (-not (Test-Path -LiteralPath $eulaPath)) { Write-Utf8File $eulaPath "eula=false`n" }
$whitelistPath = Join-Path $rootPath 'whitelist.json'
if (-not (Test-Path -LiteralPath $whitelistPath)) { Write-Utf8File $whitelistPath "[]`n" }
$whitelistJson = [System.IO.File]::ReadAllText($whitelistPath)
$whitelist = @()
if ($whitelistJson.Trim() -ne '[]') { $whitelist = @(ConvertFrom-Json -InputObject $whitelistJson) }
Write-Verbose "Staging whitelist entries: $($whitelist.Count); dedicated account bound: $([bool]$marker.testUsername)"
if ($whitelist.Count -gt 1) { throw 'The isolated staging whitelist may contain only the single dedicated test account.' }
if ($TestUsername) {
    if ($whitelist.Count -eq 0) {
        $entry = @(@{ uuid = $TestUuid; name = $TestUsername }) | ConvertTo-Json -Depth 3
        Write-Utf8File $whitelistPath $entry
    } elseif ($whitelist[0].name -ne $TestUsername -or $whitelist[0].uuid -ne $TestUuid) {
        throw 'Existing whitelist entry differs from the requested dedicated test account; inspect it manually.'
    }
}
if ($marker.testUsername) {
    if ($whitelist.Count -ne 1 -or $whitelist[0].name -ne $marker.testUsername -or $whitelist[0].uuid -ne $marker.testUuid) {
        throw 'The whitelist must contain only the test username and UUID recorded in the staging marker.'
    }
} elseif ($whitelist.Count -gt 0) {
    throw 'Set the one dedicated whitelist entry through -TestUsername and -TestUuid before starting.'
}
Write-Utf8File $markerPath ($marker | ConvertTo-Json -Depth 4)

$startScript = Join-Path $rootPath 'start-test-server.ps1'
$startContent = @'
# Managed by prepare-tauri-live-server.ps1; rerun that script to regenerate.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$eula = Get-Content -LiteralPath (Join-Path $root 'eula.txt') -Raw
if ($eula -notmatch '(?m)^eula=true\s*$') { throw 'Review Minecraft EULA and set eula=true manually before starting this server.' }
$marker = Get-Content -LiteralPath (Join-Path $root '.natux-tauri-test-server.json') -Raw | ConvertFrom-Json
$testUsername = $marker.testUsername
$testUuid = $marker.testUuid
if (-not $testUsername -or -not $testUuid) { throw 'Add the dedicated test username and UUID with prepare-tauri-live-server.ps1 first.' }
$whitelistJson = [System.IO.File]::ReadAllText((Join-Path $root 'whitelist.json'))
$players = @()
if ($whitelistJson.Trim() -ne '[]') { $players = @(ConvertFrom-Json -InputObject $whitelistJson) }
if ($players.Count -ne 1 -or $players[0].name -ne $testUsername -or $players[0].uuid -ne $testUuid) {
    throw 'The whitelist must contain only the dedicated test username and UUID.'
}
$javaMatches = @(Get-ChildItem -LiteralPath (Join-Path $root 'java-21') -Filter java.exe -File -Recurse)
if ($javaMatches.Count -ne 1) { throw 'Verified Java 21 runtime is missing.' }
$java = $javaMatches[0].FullName
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { $version = (& $java -version 2>&1 | Out-String) } finally { $ErrorActionPreference = $previousPreference }
if ($version -notmatch 'version "21(?:\.|"|\+)') { throw 'Verified Java 21 runtime is missing.' }
$paper = Join-Path $root 'paper-server.jar'
$injector = Join-Path $root 'authlib-injector-1.2.7.jar'
& $java '-Xms512M' '-Xmx1G' "-javaagent:$injector=https://vibestudy.ru/api/yggdrasil" '-jar' $paper '--nogui'
exit $LASTEXITCODE
'@
Write-Utf8File $startScript $startContent

$logsPath = Join-Path $rootPath 'logs\latest.log'
Write-Output 'Prepared an isolated Paper 1.21.1 staging directory; the server was not started.'
Write-Output "NATUX_TAURI_E2E_SERVER_ROOT=$rootPath"
Write-Output "NATUX_TAURI_E2E_SERVER_ADDRESS=127.0.0.1:$Port"
Write-Output "NATUX_E2E_SERVER_LOG=$logsPath"
Write-Output "Paper build: $($stableBuild[0].id) and Temurin $($jreRelease.version_data.semver) (SHA-256 verified); authlib-injector 1.2.7 (SHA-1 matches the launcher)."
Write-Output 'Before starting: review the EULA yourself and set eula=true only if you agree. Set the one-player whitelist with -TestUsername and -TestUuid.'
Write-Output "Start manually with: & '$startScript'"
