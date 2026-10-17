[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Source)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RegularLocalPath {
  param([string]$Filename)
  $current = Get-Item -LiteralPath $Filename -Force
  if ($current.PSIsContainer) { throw 'NSIS payload must be a regular file.' }
  while ($null -ne $current) {
    if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'NSIS payload paths must not traverse symlinks or junctions.'
    }
    if ($current -is [IO.FileInfo]) { $current = $current.Directory } else { $current = $current.Parent }
  }
}

function Get-BytesSha512 {
  param([byte[]]$Bytes)
  $hash = [Security.Cryptography.SHA512]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
}

function Assert-NsisExecutable {
  param([byte[]]$Bytes)
  if ($Bytes.Length -lt 512 -or $Bytes[0] -ne 0x4d -or $Bytes[1] -ne 0x5a) { throw 'NSIS payload must be a PE executable.' }
  $pe = [BitConverter]::ToInt32($Bytes, 0x3c)
  if ($pe -lt 0x40 -or $pe -gt $Bytes.Length - 24 -or
      [BitConverter]::ToUInt32($Bytes, $pe) -ne 0x00004550) { throw 'NSIS payload PE header is invalid.' }
  $machine = [BitConverter]::ToUInt16($Bytes, $pe + 4)
  $sections = [BitConverter]::ToUInt16($Bytes, $pe + 6)
  $optionalSize = [BitConverter]::ToUInt16($Bytes, $pe + 20)
  $optional = $pe + 24
  $tableEnd = $optional + $optionalSize + 40 * $sections
  if ($machine -notin @(0x14c, 0x8664, 0xaa64) -or $sections -lt 1 -or $sections -gt 96 -or
      $optionalSize -lt 0x60 -or $tableEnd -gt $Bytes.Length -or
      [BitConverter]::ToUInt16($Bytes, $optional) -notin @(0x10b, 0x20b)) { throw 'NSIS payload PE layout is invalid.' }
  $ascii = [Text.Encoding]::ASCII.GetString($Bytes)
  $prefix = '__TAURI_BUNDLE_TYPE_VAR_'
  $count = 0
  $offset = 0
  while (($offset = $ascii.IndexOf($prefix, $offset, [StringComparison]::Ordinal)) -ge 0) {
    if ($ascii.Substring($offset).Length -lt $prefix.Length + 3 -or
        $ascii.Substring($offset + $prefix.Length, 3) -cne 'NSS') {
      throw 'NSIS payload still has an unpatched or non-NSIS Tauri bundle marker.'
    }
    $count++
    $offset += $prefix.Length + 3
  }
  if ($count -ne 2) { throw "NSIS payload must contain exactly two patched NSS markers; found $count." }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'NSIS payload capture requires Windows.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = [IO.Path]::GetFullPath((Join-Path $repository 'src\native\target')).TrimEnd('\') + '\'
if (-not [IO.Path]::IsPathRooted($Source)) { throw 'NSIS payload Source must be absolute.' }
$canonical = [IO.Path]::GetFullPath($Source)
if (-not [string]::Equals($canonical, $Source, [StringComparison]::OrdinalIgnoreCase) -or
    -not $canonical.StartsWith($target, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'NSIS payload Source must be canonical and inside this repository src/native/target.'
}
if ([IO.Path]::GetFileName($canonical) -cne 'natux-world-launcher-native.exe') {
  throw 'NSIS payload Source must be the exact native launcher executable basename.'
}
Assert-RegularLocalPath $canonical
$destination = "$canonical.nsis-payload.exe"
if (Test-Path -LiteralPath $destination) { Assert-RegularLocalPath $destination }
$temporary = "$canonical.nsis-capture-$([Guid]::NewGuid().ToString('N')).tmp"
$sourceStream = [IO.File]::Open($canonical, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
  # Keep the source open without write/delete sharing throughout the capture.
  # No patching, signing, PE rewriting or mutable Cargo binary replacement.
  if ($sourceStream.Length -lt 512 -or $sourceStream.Length -gt 300MB) { throw 'NSIS payload executable size is invalid.' }
  $bytes = New-Object byte[] ([int]$sourceStream.Length)
  $read = 0
  while ($read -lt $bytes.Length) {
    $chunk = $sourceStream.Read($bytes, $read, $bytes.Length - $read)
    if ($chunk -eq 0) { throw 'NSIS payload source ended during capture.' }
    $read += $chunk
  }
  Assert-NsisExecutable $bytes
  $before = Get-BytesSha512 $bytes
  $output = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $output.Write($bytes, 0, $bytes.Length); $output.Flush() } finally { $output.Dispose() }
  # Replace only this fixed derived build artifact. Deleting the directory entry
  # first also avoids writing through a pre-existing hard link to another file.
  if (Test-Path -LiteralPath $destination) {
    Assert-RegularLocalPath $destination
    [IO.File]::Delete($destination)
  }
  [IO.File]::Move($temporary, $destination)
  Assert-RegularLocalPath $destination
  $copied = Get-BytesSha512 ([IO.File]::ReadAllBytes($destination))
  $sourceStream.Position = 0
  $hash = [Security.Cryptography.SHA512]::Create()
  try { $after = [BitConverter]::ToString($hash.ComputeHash($sourceStream)).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
  if ($before -cne $copied -or $before -cne $after) { throw 'NSIS payload capture does not exactly match the unchanged source bytes.' }
  [pscustomobject]@{ path = $destination; sha512 = $copied; marker = 'NSS'; markerCount = 2 } | ConvertTo-Json -Compress
} finally {
  $sourceStream.Dispose()
  if (Test-Path -LiteralPath $temporary) { [IO.File]::Delete($temporary) }
}
