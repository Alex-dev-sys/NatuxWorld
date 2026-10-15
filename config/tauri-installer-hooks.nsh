; The published Electron NSIS uses this UUID; Tauri uses the product-name key.
; Only the verified current-user installation is eligible for takeover.
!define NATUX_LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\a4b4c9af-4db5-52ba-94a5-1ac47f40eef5"
!define NATUX_RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
Var NatuxLegacyUninstaller
Var NatuxLegacyDirectory
Var NatuxLegacyStartup
Var NatuxCanonicalLegacy
Var NatuxProtectProfileTree

!macro NATUX_MIGRATION_ABORT message
  SetErrorLevel 2
  Abort "${message}"
!macroend

; Open the existing directory, following junctions/short aliases, then compare
; final volume paths. Lexical normalization alone cannot protect redirected data.
Function NatuxCanonicalDirectory
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntOp $1 $1 & 0x10
  ${If} $1 == 0
    !insertmacro NATUX_MIGRATION_ABORT "A migration directory is not a directory."
  ${EndIf}
  System::Call 'kernel32::CreateFileW(w r0, i 0x80, i 7, p 0, i 3, i 0x02000000, p 0) p.r1'
  System::Call 'kernel32::GetFinalPathNameByHandleW(p r1, w .r2, i ${NSIS_MAX_STRLEN}, i 0) i.r3'
  System::Call 'kernel32::CloseHandle(p r1)'
  ${If} $3 == 0
  ${OrIf} $3 >= ${NSIS_MAX_STRLEN}
    !insertmacro NATUX_MIGRATION_ABORT "A migration directory could not be safely resolved."
  ${EndIf}
  StrCpy $0 $2
  ${Do}
    StrLen $3 $0
    IntOp $3 $3 - 1
    StrCpy $4 $0 1 $3
    ${If} $4 != "\"
      ${ExitDo}
    ${EndIf}
    StrCpy $0 $0 $3
  ${Loop}
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; Optional standard folders may not have been created yet. All other lookup
; failures abort; an inaccessible existing folder must never be treated as absent.
Function NatuxProtectDirectory
  Exch $0
  Push $1
  Push $2
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1 ?e'
  Pop $2
  IntCmp $1 -1 natux_protected_missing natux_protected_existing natux_protected_existing
  natux_protected_missing:
    ${If} $2 != 2
    ${AndIf} $2 != 3
      !insertmacro NATUX_MIGRATION_ABORT "A protected user directory could not be inspected."
    ${EndIf}
    Goto natux_protected_done
  natux_protected_existing:
    Push $0
    Call NatuxCanonicalDirectory
    Pop $0
    StrLen $1 $NatuxCanonicalLegacy
    StrCpy $2 $0 $1
    ; StrCmp/LogicLib string comparisons are case-insensitive on Windows.
    ${If} $2 == $NatuxCanonicalLegacy
      StrCpy $2 $0 1 $1
      ${If} $2 == ""
      ${OrIf} $2 == "\"
        !insertmacro NATUX_MIGRATION_ABORT "The previous installation contains protected user data. Move or back up the data before migrating."
      ${EndIf}
    ${EndIf}
    ; A custom install inside minecraft/saves/mods is just as destructive as an
    ; install enclosing the profile. Only profile trees reject both directions;
    ; ordinary AppData children (including Programs) remain valid app locations.
    ${If} $NatuxProtectProfileTree == "1"
      StrLen $1 $0
      StrCpy $2 $NatuxCanonicalLegacy $1
      ${If} $2 == $0
        StrCpy $2 $NatuxCanonicalLegacy 1 $1
        ${If} $2 == ""
        ${OrIf} $2 == "\"
          !insertmacro NATUX_MIGRATION_ABORT "The previous installation overlaps the preserved game profile. Move or back up the data before migrating."
        ${EndIf}
      ${EndIf}
    ${EndIf}
  natux_protected_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function NatuxProtectKnownFolder
  Exch $0
  Push $1
  Push $2
  StrCpy $1 0
  ; KF_FLAG_DONT_VERIFY resolves configured paths even when a fresh account has
  ; not created an optional Downloads/Saved Games folder. Do not create it here.
  System::Call 'shell32::SHGetKnownFolderPath(g r0, i 0x4000, p 0, *p .r1) i.r2'
  ${If} $2 != 0
    ${If} $1 != 0
      System::Call 'ole32::CoTaskMemFree(p r1)'
    ${EndIf}
    ; The optional folder can be unregistered as well as absent on disk.
    ; Only HRESULT_FROM_WIN32(FILE/PATH_NOT_FOUND) is safe to skip.
    ${If} $2 == -2147024894
    ${OrIf} $2 == -2147024893
      Goto natux_known_folder_done
    ${EndIf}
    !insertmacro NATUX_MIGRATION_ABORT "A standard user directory could not be resolved."
  ${EndIf}
  ${If} $1 == 0
    !insertmacro NATUX_MIGRATION_ABORT "A standard user directory did not return a path."
  ${EndIf}
  System::Call 'kernel32::lstrlenW(p r1) i.r2'
  ${If} $2 == 0
  ${OrIf} $2 >= ${NSIS_MAX_STRLEN}
    System::Call 'ole32::CoTaskMemFree(p r1)'
    !insertmacro NATUX_MIGRATION_ABORT "A standard user directory is unsupported."
  ${EndIf}
  IntOp $2 $2 + 1
  System::Call '*$1(&w$2 .r0)'
  System::Call 'ole32::CoTaskMemFree(p r1)'
  Push $0
  Call NatuxProtectDirectory
  natux_known_folder_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro NATUX_PROTECT_DIRECTORY directory
  Push "${directory}"
  Call NatuxProtectDirectory
!macroend

!macro NATUX_PROTECT_PROFILE directory
  StrCpy $NatuxProtectProfileTree "1"
  !insertmacro NATUX_PROTECT_DIRECTORY "${directory}"
  StrCpy $NatuxProtectProfileTree "0"
!macroend

!macro NATUX_CHECK_PROTECTED_DIRECTORIES
  !insertmacro NATUX_PROTECT_PROFILE "$APPDATA\natux-world-launcher"
  !insertmacro NATUX_PROTECT_DIRECTORY "$APPDATA"
  !insertmacro NATUX_PROTECT_DIRECTORY "$LOCALAPPDATA"
  !insertmacro NATUX_PROTECT_DIRECTORY "$PROFILE"
  !insertmacro NATUX_PROTECT_DIRECTORY "$DESKTOP"
  !insertmacro NATUX_PROTECT_DIRECTORY "$DOCUMENTS"
  !insertmacro NATUX_PROTECT_DIRECTORY "$MUSIC"
  !insertmacro NATUX_PROTECT_DIRECTORY "$PICTURES"
  !insertmacro NATUX_PROTECT_DIRECTORY "$VIDEOS"
  !insertmacro NATUX_PROTECT_DIRECTORY "$FAVORITES"
  !insertmacro NATUX_PROTECT_DIRECTORY "$TEMPLATES"
  !insertmacro NATUX_PROTECT_DIRECTORY "$STARTMENU"
  ; Rust/Electron use the inherited APPDATA, which can differ from shell folders.
  ReadEnvStr $0 "APPDATA"
  ${If} $0 == ""
    !insertmacro NATUX_MIGRATION_ABORT "The installed profile directory is unavailable."
  ${EndIf}
  !insertmacro NATUX_PROTECT_PROFILE "$0\natux-world-launcher"
  !insertmacro NATUX_PROTECT_DIRECTORY "$0"
  ; Downloads and Saved Games can be redirected outside the user home.
  Push "{374DE290-123F-4565-9164-39C4925E467B}"
  Call NatuxProtectKnownFolder
  Push "{4C5C32FF-BB9D-43B0-BF7D-478D689A2CF6}"
  Call NatuxProtectKnownFolder
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
    Push "$NatuxLegacyDirectory"
    Call NatuxCanonicalDirectory
    Pop $NatuxCanonicalLegacy
    !insertmacro NATUX_CHECK_PROTECTED_DIRECTORIES
    !insertmacro NATUX_CAPTURE_STARTUP "world.natux.launcher"
    !insertmacro NATUX_CAPTURE_STARTUP "electron.app.NATUX WORLD"
    !insertmacro NATUX_CAPTURE_STARTUP "electron.app.natux-world-launcher"
    ; Keep the install directory out of the installer's working-directory handle.
    ; _?= runs the uninstaller in place and lets ExecWait observe its real exit.
    ; The old uninstaller recursively deletes its install directory. The canonical
    ; preflight above excludes preserved profiles and standard user-data roots.
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
