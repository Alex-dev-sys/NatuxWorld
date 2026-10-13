use super::*;
use serde_json::json;
use tempfile::tempdir;

fn legacy_dir(
    platform: LegacyPlatform,
    app_data: Option<&str>,
    home: Option<&str>,
    xdg_config: Option<&str>,
) -> PathBuf {
    legacy_user_data_dir(
        platform,
        LegacyEnvironment {
            app_data: app_data.map(OsStr::new),
            home: home.map(OsStr::new),
            xdg_config: xdg_config.map(OsStr::new),
        },
    )
    .unwrap()
}

fn normalized(path: PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[test]
fn defaults_match_the_electron_launcher_contract() {
    let settings = LauncherSettings::default();
    assert_eq!((settings.memory, settings.language.as_str()), (4096, "ru"));
    assert_eq!(
        (settings.resolution.width, settings.resolution.height),
        (1280, 720)
    );
    assert_eq!(
        (settings.java_mode.as_str(), settings.auto_update),
        ("bundled", true)
    );
    assert!(!settings.telemetry_enabled && settings.install_id.is_empty());
}

#[test]
fn legacy_user_data_directory_matches_the_packaged_electron_name() {
    let package: Value = serde_json::from_str(include_str!("../../../../package.json"))
        .expect("Electron package metadata");
    let electron_name = package
        .get("productName")
        .and_then(Value::as_str)
        .or_else(|| package.get("name").and_then(Value::as_str))
        .expect("Electron package name");

    assert_eq!(LEGACY_APP_NAME, electron_name);
}

#[test]
fn first_read_creates_legacy_settings_with_a_stable_install_id() {
    let temp = tempdir().expect("temporary directory");
    let path = temp.path().join("natux-world-launcher/settings.json");
    let store = SettingsStore::new(path.clone());
    let first = store.get().expect("initial settings");
    assert!(!first.install_id.is_empty());
    assert_eq!(store.get().unwrap(), first);
    let saved: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(saved["installId"], first.install_id);
}

#[test]
fn patch_validation_clamps_ranges_and_never_accepts_renderer_install_id() {
    let temp = tempdir().expect("temporary directory");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let first = store.get().unwrap();
    let updated = store.set(json!({"memory":100000,"language":"fr","updateChannel":"nightly","resolution":{"width":200,"height":9000},"telemetryEnabled":"yes","crashReports":true,"installId":"renderer-controlled","unexpected":"ignored"})).unwrap();
    assert_eq!(updated.memory, MAX_MEMORY_MIB);
    assert_eq!(
        (updated.resolution.width, updated.resolution.height),
        (640, 4320)
    );
    assert_eq!(
        (updated.language.as_str(), updated.update_channel.as_str()),
        ("ru", "stable")
    );
    assert!(!updated.telemetry_enabled && updated.crash_reports);
    assert_eq!(updated.install_id, first.install_id);
    let lower = store
        .set(json!({"memory":1,"resolution":{"width":1,"height":1}}))
        .unwrap();
    assert_eq!(lower.memory, MIN_MEMORY_MIB);
    assert_eq!(
        (lower.resolution.width, lower.resolution.height),
        (640, 480)
    );
    assert!(store.set(json!(null)).is_err());
}

#[test]
fn reset_keeps_install_id_and_restores_all_other_defaults() {
    let temp = tempdir().expect("temporary directory");
    let store = SettingsStore::new(temp.path().join("settings.json"));
    let first = store.get().unwrap();
    store
        .set(json!({"memory":8192,"language":"en","autoUpdate":false}))
        .unwrap();
    let reset = store.reset().unwrap();
    assert_eq!(reset.install_id, first.install_id);
    assert_eq!(reset.memory, 4096);
    assert_eq!(reset.language, "ru");
    assert!(reset.auto_update);
    assert_eq!(store.get().unwrap(), reset);
}

#[test]
fn updates_preserve_unknown_legacy_fields_until_settings_are_reset() {
    let temp = tempdir().expect("temporary directory");
    let path = temp.path().join("settings.json");
    let legacy = json!({
        "memory": 8192,
        "installId": "legacy-install-id",
        "futureFlag": true,
        "futureOptions": {"enabled": true, "values": [1, 2, 3]},
        "resolution": {"width": 1440, "height": 900, "futureScaling": "pixel-perfect"}
    });
    fs::write(&path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();

    let store = SettingsStore::new(path.clone());
    assert_eq!(store.get().unwrap().memory, 8192);
    store
        .set(json!({"language":"en","futureFlag":false}))
        .unwrap();
    let updated: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(updated["language"], "en");
    assert_eq!(updated["futureFlag"], true);
    assert_eq!(updated["futureOptions"], legacy["futureOptions"]);
    assert_eq!(updated["resolution"]["width"], 1440);
    assert_eq!(updated["resolution"]["height"], 900);
    assert_eq!(updated["resolution"]["futureScaling"], "pixel-perfect");

    store.reset().unwrap();
    let reset: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(reset["installId"], "legacy-install-id");
    assert!(reset.get("futureFlag").is_none());
    assert!(reset.get("futureOptions").is_none());
    assert!(reset["resolution"].get("futureScaling").is_none());
}

#[test]
fn persistence_is_atomic_and_a_failed_write_preserves_the_previous_file() {
    let temp = tempdir().expect("temporary directory");
    let path = temp.path().join("settings.json");
    fs::write(&path, b"previous-valid-settings").unwrap();
    let result: Result<(), atomicwrites::Error<io::Error>> = AtomicFile::new(&path, AllowOverwrite)
        .write(|file| {
            io::Write::write_all(file, b"partial-new-settings")?;
            Err(io::Error::other("simulated interrupted serialization"))
        });
    assert!(result.is_err());
    assert_eq!(fs::read(&path).unwrap(), b"previous-valid-settings");
    let valid_store = SettingsStore::new(temp.path().join("valid/settings.json"));
    let settings = valid_store.get().unwrap();
    let saved: Value =
        serde_json::from_slice(&fs::read(temp.path().join("valid/settings.json")).unwrap())
            .unwrap();
    assert_eq!(saved["installId"], settings.install_id);
    assert!(saved["memory"].is_number());
}

#[test]
fn malformed_or_non_object_settings_are_backed_up_before_defaults_are_written() {
    for (index, corrupt) in [b"{broken settings".as_slice(), b"[]"]
        .into_iter()
        .enumerate()
    {
        let temp = tempdir().expect("temporary directory");
        let path = temp.path().join(format!("settings-{index}.json"));
        fs::write(&path, corrupt).expect("corrupt settings");

        let settings = SettingsStore::new(path.clone())
            .get()
            .expect("default settings after recovery");

        assert_eq!(settings.memory, 4096);
        assert!(!settings.install_id.is_empty());
        let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["installId"], settings.install_id);
        assert_eq!(saved["memory"], 4096);
        let backups = fs::read_dir(temp.path())
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|candidate| {
                candidate
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with(&format!("settings-{index}.json.corrupt-"))
            })
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(&backups[0]).unwrap(), corrupt);
    }
}

#[test]
fn legacy_path_resolution_matches_electron_on_windows_macos_and_linux() {
    let actual = [
        normalized(legacy_dir(
            LegacyPlatform::Windows,
            Some(r"C:\Users\Player\AppData\Roaming"),
            None,
            None,
        )),
        normalized(legacy_dir(
            LegacyPlatform::MacOs,
            None,
            Some("/Users/player"),
            None,
        )),
        normalized(legacy_dir(
            LegacyPlatform::Linux,
            None,
            Some("/home/player"),
            Some("/mnt/config"),
        )),
        normalized(legacy_dir(
            LegacyPlatform::Linux,
            None,
            Some("/home/player"),
            None,
        )),
    ];
    assert_eq!(
        actual,
        [
            "C:/Users/Player/AppData/Roaming/natux-world-launcher",
            "/Users/player/Library/Application Support/natux-world-launcher",
            "/mnt/config/natux-world-launcher",
            "/home/player/.config/natux-world-launcher",
        ]
    );
}
