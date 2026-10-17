//! Retire only verified Electron startup registrations after Tauri takes ownership.

#[cfg(any(windows, test))]
use std::path::{Path, PathBuf};

#[cfg(windows)]
mod windows;

#[cfg(any(target_os = "macos", test))]
mod macos;

#[cfg(any(windows, test))]
const LEGACY_NAMES: &[&str] = &[
    "world.natux.launcher",
    "electron.app.NATUX WORLD",
    "electron.app.natux-world-launcher",
];

#[cfg(any(windows, test))]
trait StartupBackend {
    fn read(&self, name: &str) -> Result<Option<String>, String>;
    fn write(&self, name: &str, command: &str) -> Result<(), String>;
    fn remove_if_unchanged(&self, name: &str, expected: &str) -> Result<(), String>;
}

#[cfg(windows)]
pub(crate) fn set_user_autostart(enabled: bool) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|_| "startup path unavailable")?;
    configure_user_registration(
        &windows::RegistryBackend,
        crate::brand::name(),
        &executable,
        enabled,
    )
}

#[cfg(any(windows, test))]
fn configure_user_registration(
    backend: &impl StartupBackend,
    name: &str,
    executable: &Path,
    enabled: bool,
) -> Result<(), String> {
    let path = executable
        .to_str()
        .ok_or("startup path is not valid Unicode")?;
    if path.contains('"') || path.chars().any(char::is_control) {
        return Err("startup path contains unsupported characters".to_owned());
    }
    let command = format!("\"{path}\" --from-autostart");
    let existing = backend.read(name)?;
    if let Some(existing) = existing.as_deref() {
        if normalize_windows_path(existing) != normalize_windows_path(&command) {
            return Err("startup registration belongs to another installation".to_owned());
        }
        if !enabled {
            return backend.remove_if_unchanged(name, existing);
        }
    }
    if enabled {
        backend.write(name, &command)?;
    }
    Ok(())
}

pub(crate) fn retire_legacy_autostart() -> Result<(), String> {
    #[cfg(windows)]
    {
        let executable = std::env::current_exe().map_err(|_| "startup path unavailable")?;
        let local_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        retire_verified_entries(
            &windows::RegistryBackend,
            &executable,
            local_data.as_deref(),
        )
    }
    #[cfg(target_os = "macos")]
    {
        macos::retire()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Ok(())
    }
}

#[cfg(any(windows, test))]
fn retire_verified_entries(
    backend: &impl StartupBackend,
    current_executable: &Path,
    local_data: Option<&Path>,
) -> Result<(), String> {
    let mut legacy_paths = Vec::new();
    if let Some(parent) = current_executable.parent() {
        legacy_paths.push(parent.join("NATUX WORLD.exe"));
    }
    if let Some(local_data) = local_data {
        for directory in ["NATUX WORLD", "natux-world-launcher"] {
            legacy_paths.push(
                local_data
                    .join("Programs")
                    .join(directory)
                    .join("NATUX WORLD.exe"),
            );
            legacy_paths.push(
                local_data
                    .join("Programs")
                    .join(directory)
                    .join("NATUX WORLD")
                    .join("NATUX WORLD.exe"),
            );
        }
    }
    for name in LEGACY_NAMES {
        let Some(command) = backend.read(name)? else {
            continue;
        };
        if command_matches_legacy_installation(&command, &legacy_paths) {
            backend.remove_if_unchanged(name, &command)?;
        }
    }
    Ok(())
}

#[cfg(any(windows, test))]
fn command_matches_legacy_installation(command: &str, allowed_paths: &[PathBuf]) -> bool {
    if command.len() > 16_384 || command.chars().any(char::is_control) {
        return false;
    }
    let command = command.trim();
    let (executable, arguments) = if let Some(quoted) = command.strip_prefix('"') {
        let Some((executable, arguments)) = quoted.split_once('"') else {
            return false;
        };
        (executable, arguments.trim())
    } else {
        command
            .split_once(char::is_whitespace)
            .unwrap_or((command, ""))
    };
    if !matches!(arguments.trim(), "" | "--hidden") {
        return false;
    }
    let normalized = normalize_windows_path(executable);
    if normalized
        .split('\\')
        .any(|segment| matches!(segment, "." | ".."))
    {
        return false;
    }
    allowed_paths
        .iter()
        .any(|allowed| normalize_windows_path(&allowed.to_string_lossy()) == normalized)
}

#[cfg(any(windows, test))]
fn normalize_windows_path(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use super::*;

    #[derive(Default)]
    struct FakeBackend {
        entries: RefCell<HashMap<String, String>>,
        removed: RefCell<Vec<String>>,
    }

    impl StartupBackend for FakeBackend {
        fn read(&self, name: &str) -> Result<Option<String>, String> {
            Ok(self.entries.borrow().get(name).cloned())
        }

        fn write(&self, name: &str, command: &str) -> Result<(), String> {
            self.entries
                .borrow_mut()
                .insert(name.to_owned(), command.to_owned());
            Ok(())
        }

        fn remove_if_unchanged(&self, name: &str, expected: &str) -> Result<(), String> {
            if self.entries.borrow().get(name).map(String::as_str) == Some(expected) {
                self.entries.borrow_mut().remove(name);
                self.removed.borrow_mut().push(name.to_owned());
            }
            Ok(())
        }
    }

    #[test]
    fn takeover_recognizes_the_nested_legacy_nsis_install_directory() {
        let backend = FakeBackend::default();
        backend.entries.borrow_mut().insert("world.natux.launcher".to_owned(),
            "\"C:/Users/test/AppData/Local/Programs/natux-world-launcher/NATUX WORLD/NATUX WORLD.exe\" --hidden".to_owned());
        retire_verified_entries(
            &backend,
            Path::new("C:/New/natux-world-launcher-native.exe"),
            Some(Path::new("C:/Users/test/AppData/Local")),
        )
        .unwrap();
        assert_eq!(
            backend.removed.borrow().as_slice(),
            ["world.natux.launcher"]
        );
    }

    #[test]
    fn user_autostart_quotes_paths_and_preserves_other_installations() {
        let backend = FakeBackend::default();
        let executable = Path::new("C:/Launcher With Spaces/natux-world-launcher-native.exe");
        configure_user_registration(&backend, "NATUX WORLD", executable, true).unwrap();
        assert_eq!(
            backend.entries.borrow()["NATUX WORLD"],
            "\"C:/Launcher With Spaces/natux-world-launcher-native.exe\" --from-autostart"
        );
        let other = Path::new("C:/Other/natux-world-launcher-native.exe");
        assert!(configure_user_registration(&backend, "NATUX WORLD", other, true).is_err());
        assert!(configure_user_registration(&backend, "NATUX WORLD", other, false).is_err());
        assert!(backend.removed.borrow().is_empty());
        configure_user_registration(&backend, "NATUX WORLD", executable, false).unwrap();
        assert!(backend.entries.borrow().is_empty());
    }

    #[test]
    fn takeover_removes_only_known_electron_entry_with_exact_legacy_install_path() {
        let backend = FakeBackend::default();
        backend.entries.borrow_mut().extend([
            (
                LEGACY_NAMES[0].to_owned(),
                r#""C:\Users\Player\AppData\Local\Programs\NATUX WORLD\NATUX WORLD.exe" --hidden"#
                    .to_owned(),
            ),
            (
                LEGACY_NAMES[1].to_owned(),
                r#""C:\Unrelated\NATUX WORLD.exe""#.to_owned(),
            ),
            (
                "Other Application".to_owned(),
                r#""C:\Users\Player\AppData\Local\Programs\NATUX WORLD\NATUX WORLD.exe""#
                    .to_owned(),
            ),
            (
                "NATUX WORLD".to_owned(),
                r#""C:\New\natux-world-launcher-native.exe" --from-autostart"#.to_owned(),
            ),
        ]);
        retire_verified_entries(
            &backend,
            Path::new("C:/New/natux-world-launcher-native.exe"),
            Some(Path::new("C:/Users/Player/AppData/Local")),
        )
        .unwrap();
        assert_eq!(*backend.removed.borrow(), vec![LEGACY_NAMES[0]]);
        assert_eq!(backend.entries.borrow().len(), 3);
    }

    #[test]
    fn takeover_accepts_the_previous_executable_in_the_same_install_directory() {
        let backend = FakeBackend::default();
        backend.entries.borrow_mut().insert(
            LEGACY_NAMES[0].to_owned(),
            r#""C:\Launcher\NATUX WORLD.exe""#.to_owned(),
        );
        retire_verified_entries(
            &backend,
            Path::new("C:/Launcher/natux-world-launcher-native.exe"),
            None,
        )
        .unwrap();
        assert_eq!(*backend.removed.borrow(), vec![LEGACY_NAMES[0]]);
    }

    #[test]
    fn unrecognized_commands_and_path_traversal_remain_untouched() {
        let allowed = vec![PathBuf::from("C:/Launcher/NATUX WORLD.exe")];
        for command in [
            r#""C:\Launcher\NATUX WORLD.exe" --unrecognized"#,
            r#""C:\Launcher\NATUX WORLD.exe" && another.exe"#,
            r#""C:\Launcher\..\Launcher\NATUX WORLD.exe""#,
            r#""C:\Launcher\different.exe""#,
            r#""C:\Launcher\NATUX WORLD.exe" --from-autostart"#,
        ] {
            assert!(
                !command_matches_legacy_installation(command, &allowed),
                "{command}"
            );
        }
    }
}
