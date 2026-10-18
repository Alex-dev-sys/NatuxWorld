function Test-NatuxAclRestoration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$OriginalSddl,
        [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$RestoredSddl
    )

    # Parsing failures are deliberately not caught: malformed descriptors fail closed.
    $original = [Security.AccessControl.RawSecurityDescriptor]::new($OriginalSddl)
    $restored = [Security.AccessControl.RawSecurityDescriptor]::new($RestoredSddl)
    $originalFlags = [int]$original.ControlFlags
    $restoredFlags = [int]$restored.ControlFlags
    $autoInherited = [int][Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInherited
    if ($restoredFlags -ne $originalFlags) {
        if (($originalFlags -band $autoInherited) -ne 0 -or $restoredFlags -ne ($originalFlags -bor $autoInherited)) {
            return $false
        }
        $restored.SetFlags($original.ControlFlags)
    }

    # Compare the complete descriptor, including owner/group, SACL, ACEs and order.
    if ($original.BinaryLength -ne $restored.BinaryLength) { return $false }
    $originalBytes = [byte[]]::new($original.BinaryLength)
    $restoredBytes = [byte[]]::new($restored.BinaryLength)
    $original.GetBinaryForm($originalBytes, 0)
    $restored.GetBinaryForm($restoredBytes, 0)
    for ($index = 0; $index -lt $originalBytes.Length; $index++) {
        if ($originalBytes[$index] -ne $restoredBytes[$index]) { return $false }
    }
    return $true
}

Export-ModuleMember -Function Test-NatuxAclRestoration
