; The published Electron NSIS uses this UUID; Tauri uses the product-name key.
; Only the verified current-user installation is eligible for takeover.
!define NATUX_LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\a4b4c9af-4db5-52ba-94a5-1ac47f40eef5"
!define NATUX_RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
Var NatuxLegacyUninstaller
Var NatuxLegacyDirectory
Var NatuxLegacyStartup

!macro NATUX_MIGRATION_ABORT message
  SetErrorLevel 2
  Abort "${message}"
!macroend

!macro NATUX_CAPTURE_STARTUP entry
  ReadRegStr $R0 HKCU "${NATUX_RUNKEY}" "${entry}"
  ${If} $R0 == '$\"$NatuxLegacyDirectory\NATUX WORLD.exe$\"'
  ${OrIf} $R0 == '$\"$NatuxLegacyDirectory\NATUX WORLD.exe$\" --hidden'
    StrCpy $NatuxLegacyStartup "1"
  ${EndIf}
!macroend

!macro NATUX_RETIRE_STARTUP entry
  ReadRegStr $R0 HKCU "${NATUX_RUNKEY}" "${entry}"
  ${If} $R0 == '$\"$NatuxLegacyDirectory\NATUX WORLD.exe$\"'
  ${OrIf} $R0 == '$\"$NatuxLegacyDirectory\NATUX WORLD.exe$\" --hidden'
    DeleteRegValue HKCU "${NATUX_RUNKEY}" "${entry}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  StrCpy $NatuxLegacyStartup "0"
  ReadRegStr $R0 HKCU "${NATUX_LEGACY_UNINSTKEY}" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKCU "${NATUX_LEGACY_UNINSTKEY}" "Publisher"
    ${If} $R1 != "NATUX WORLD"
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD installation could not be verified."
    ${EndIf}
    ReadRegStr $R1 HKCU "${NATUX_LEGACY_UNINSTKEY}" "DisplayName"
    StrCpy $R1 $R1 12
    ${If} $R1 != "NATUX WORLD "
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD product identity could not be verified."
    ${EndIf}
    ; Accept a quoted executable followed only by the known current-user flag.
    StrCpy $R1 $R0 1
    ${If} $R1 != '$\"'
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD uninstall command is unsupported."
    ${EndIf}
    StrCpy $NatuxLegacyUninstaller ""
    StrCpy $R2 1
    ${Do}
      StrCpy $R1 $R0 1 $R2
      ${If} $R1 == ""
        !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD uninstall command is incomplete."
      ${EndIf}
      IntOp $R2 $R2 + 1
      ${If} $R1 == '$\"'
        ${ExitDo}
      ${EndIf}
      StrCpy $NatuxLegacyUninstaller "$NatuxLegacyUninstaller$R1"
    ${Loop}
    StrCpy $R1 $R0 "" $R2
    ${If} $R1 != ""
    ${AndIf} $R1 != " /currentuser"
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD uninstall arguments are unsupported."
    ${EndIf}
    ${GetFileName} "$NatuxLegacyUninstaller" $R1
    ${If} $R1 != "Uninstall NATUX WORLD.exe"
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD uninstaller is not recognized."
    ${EndIf}
    ${GetParent} "$NatuxLegacyUninstaller" $NatuxLegacyDirectory
    ${GetRoot} "$NatuxLegacyDirectory" $R1
    StrLen $R3 $R1
    StrCpy $R4 $R1 1 1
    ${If} $R3 != 2
    ${OrIf} $R4 != ":"
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD directory must be on a local drive."
    ${EndIf}
    StrCpy $R4 $NatuxLegacyDirectory 3
    ${If} $R4 != "$R1\"
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD directory must be absolute."
    ${EndIf}
    ${If} $NatuxLegacyDirectory == ""
    ${OrIf} $NatuxLegacyDirectory == $R1
    ${OrIf} $NatuxLegacyDirectory == "$R1\"
      !insertmacro NATUX_MIGRATION_ABORT "Refusing to uninstall NATUX WORLD from a filesystem root."
    ${EndIf}
    IfFileExists "$NatuxLegacyUninstaller" 0 natux_legacy_invalid
    IfFileExists "$NatuxLegacyDirectory\NATUX WORLD.exe" 0 natux_legacy_invalid
    IfFileExists "$NatuxLegacyDirectory\resources\app.asar" 0 natux_legacy_invalid
    Goto natux_legacy_verified
    natux_legacy_invalid:
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD installation files could not be verified."
    natux_legacy_verified:
    !insertmacro NATUX_CAPTURE_STARTUP "world.natux.launcher"
    !insertmacro NATUX_CAPTURE_STARTUP "electron.app.NATUX WORLD"
    !insertmacro NATUX_CAPTURE_STARTUP "electron.app.natux-world-launcher"
    ; Keep the install directory out of the installer's working-directory handle.
    ; _?= runs the uninstaller in place and lets ExecWait observe its real exit.
    ; Electron preserves app data unless --delete-app-data is explicitly passed.
    SetOutPath "$TEMP"
    ClearErrors
    ExecWait '$\"$NatuxLegacyUninstaller$\" /S /currentuser _?=$NatuxLegacyDirectory' $R0
    ${If} ${Errors}
      !insertmacro NATUX_MIGRATION_ABORT "Could not start the previous NATUX WORLD uninstaller."
    ${EndIf}
    ${If} $R0 != 0
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD uninstall failed."
    ${EndIf}
    ReadRegStr $R0 HKCU "${NATUX_LEGACY_UNINSTKEY}" "UninstallString"
    ${If} $R0 != ""
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD installation is still registered."
    ${EndIf}
    IfFileExists "$NatuxLegacyDirectory\NATUX WORLD.exe" natux_legacy_leftovers 0
    IfFileExists "$NatuxLegacyDirectory\resources\app.asar" natux_legacy_leftovers 0
    Goto natux_legacy_removed
    natux_legacy_leftovers:
      !insertmacro NATUX_MIGRATION_ABORT "The previous NATUX WORLD runtime was not removed."
    natux_legacy_removed:
    Delete "$NatuxLegacyUninstaller"
    !insertmacro NATUX_RETIRE_STARTUP "world.natux.launcher"
    !insertmacro NATUX_RETIRE_STARTUP "electron.app.NATUX WORLD"
    !insertmacro NATUX_RETIRE_STARTUP "electron.app.natux-world-launcher"
    SetOutPath "$INSTDIR"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $NatuxLegacyStartup == "1"
    ReadRegStr $R0 HKCU "${NATUX_RUNKEY}" "${PRODUCTNAME}"
    ${If} $R0 == ""
    ${OrIf} $R0 == '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --from-autostart'
      WriteRegStr HKCU "${NATUX_RUNKEY}" "${PRODUCTNAME}" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --from-autostart'
    ${EndIf}
  ${EndIf}
!macroend
