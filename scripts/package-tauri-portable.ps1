param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$OutputFile
)
$ErrorActionPreference = 'Stop'
[AppContext]::SetSwitch('Switch.System.IO.Compression.ZipFile.UseBackslash', $false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourcePath = (Resolve-Path -LiteralPath $SourceDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputFile)
if ([System.IO.Path]::GetDirectoryName($sourcePath) -ne [System.IO.Path]::GetDirectoryName($outputPath)) {
    throw 'Portable staging and archive must have the same parent directory.'
}
if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourcePath, $outputPath)
