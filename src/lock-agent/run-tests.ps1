$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
$agentSources = Join-Path $projectRoot 'src/main/java'
$testSources = Join-Path $projectRoot 'src/test/java'
$buildRoot = Join-Path $projectRoot 'build'
$agentClasses = Join-Path $buildRoot 'agent-classes'
$testClasses = Join-Path $buildRoot 'test-classes'
$manifestPath = Join-Path $buildRoot 'MANIFEST.MF'
$agentJar = Join-Path $buildRoot 'natux-lock-agent.jar'

$javac = (Get-Command javac -ErrorAction Stop).Source
$java = (Get-Command java -ErrorAction Stop).Source
$javaHome = $env:JAVA_HOME
if ([string]::IsNullOrWhiteSpace($javaHome)) {
    $javaSettings = (& $java -XshowSettings:properties -version 2>&1 | Out-String)
    if ($javaSettings -match '(?m)^\s*java\.home\s*=\s*(.+?)\s*$') {
        $javaHome = $Matches[1].Trim()
    }
}
$jar = if (-not [string]::IsNullOrWhiteSpace($javaHome)) {
    Join-Path $javaHome 'bin/jar.exe'
} else {
    $null
}
if (-not $jar -or -not (Test-Path -LiteralPath $jar)) {
    $jar = (Get-Command jar -ErrorAction Stop).Source
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $agentClasses, $testClasses -Force | Out-Null

$mainFiles = @(Get-ChildItem -LiteralPath $agentSources -Filter '*.java' -Recurse | ForEach-Object FullName)
$testFiles = @(Get-ChildItem -LiteralPath $testSources -Filter '*.java' -Recurse | ForEach-Object FullName)
if ($mainFiles.Count -eq 0 -or $testFiles.Count -eq 0) {
    throw 'Lock-agent source or test files are missing.'
}

& $javac --release 8 -d $agentClasses $mainFiles
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

[System.IO.File]::WriteAllText(
    $manifestPath,
    "Manifest-Version: 1.0`r`nPremain-Class: com.natuxworld.lockagent.NatuxLockAgent`r`n`r`n",
    [System.Text.Encoding]::ASCII)
& $jar cfm $agentJar $manifestPath -C $agentClasses .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $javac --release 8 -cp $agentClasses -d $testClasses $testFiles
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$classPath = $testClasses + [System.IO.Path]::PathSeparator + $agentClasses
& $java -cp $classPath com.natuxworld.lockagent.test.LockAgentTestSuite $java $agentJar $classPath
exit $LASTEXITCODE
