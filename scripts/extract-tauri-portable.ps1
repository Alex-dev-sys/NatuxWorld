param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$destinationPath = [System.IO.Path]::GetFullPath($DestinationDirectory)
if (Test-Path -LiteralPath $destinationPath) { throw 'Portable extraction destination must not exist.' }
[System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $destinationPath)
