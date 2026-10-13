use super::*;
use serde_json::Value;
use tempfile::tempdir;

fn normalize(path: PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[test]
fn finished_session_preserves_the_legacy_json_contract() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("natux-world-launcher/playtime.json");
    let service = PlaytimeService::new(file.clone()).unwrap();

    service.begin_session().unwrap();
    assert!(service.get_stats().unwrap().in_game);
    service.end_session().unwrap();
    let stats = service.get_stats().unwrap();
    let saved: Value = serde_json::from_slice(&fs::read(file).unwrap()).unwrap();

    assert!(!stats.in_game);
    assert_eq!(stats.sessions.len(), 1);
    assert!(saved["totalMs"].is_number());
    assert!(saved["sessions"][0]["start"].is_number());
    assert!(saved["sessions"][0]["end"].is_number());
    assert!(saved["activeStart"].is_null());
    assert!(saved["activeHeartbeat"].is_null());
}

#[test]
fn dropping_the_service_closes_an_active_session() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("playtime.json");
    {
        let service = PlaytimeService::new(file.clone()).unwrap();
        service.begin_session().unwrap();
        assert!(service.get_stats().unwrap().in_game);
    }

    let saved: PlaytimeFile = serde_json::from_slice(&fs::read(file).unwrap()).unwrap();
    assert!(saved.active_start.is_none());
    assert!(saved.active_heartbeat.is_none());
    assert_eq!(saved.sessions.len(), 1);
    assert!(saved.sessions[0].end >= saved.sessions[0].start);
}

#[test]
fn heartbeat_and_end_are_serialized_and_a_late_tick_cannot_reopen_session() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("playtime.json");
    let service = std::sync::Arc::new(PlaytimeService::new(file.clone()).unwrap());
    service.begin_session().unwrap();

    let heartbeat_service = std::sync::Arc::clone(&service);
    let heartbeat = thread::spawn(move || heartbeat_service.heartbeat());
    service.end_session().unwrap();
    let _ = heartbeat.join().unwrap();

    let stats = service.get_stats().unwrap();
    let saved: PlaytimeFile = serde_json::from_slice(&fs::read(file).unwrap()).unwrap();
    assert!(!stats.in_game);
    assert_eq!(stats.sessions.len(), 1);
    assert_eq!(saved.active_start, None);
    assert_eq!(saved.active_heartbeat, None);
}

#[test]
fn stale_session_recovers_only_through_its_last_heartbeat_and_persists_repair() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("playtime.json");
    let start = 1_700_000_000_000;
    let last_heartbeat = start + 60_000;
    let state = PlaytimeFile {
        active_start: Some(start),
        active_heartbeat: Some(last_heartbeat),
        ..PlaytimeFile::default()
    };
    save(&file, &state).unwrap();

    let (stats, still_active) = stats_file(&file, start + 24 * 60 * 60 * 1000).unwrap();
    let repaired: PlaytimeFile = serde_json::from_slice(&fs::read(file).unwrap()).unwrap();

    assert!(!still_active && !stats.in_game);
    assert_eq!(stats.total_ms, 60_000);
    assert_eq!(
        stats.last_session,
        Some(PlaytimeSession {
            start,
            end: last_heartbeat
        })
    );
    assert_eq!(repaired.active_start, None);
    assert_eq!(repaired.active_heartbeat, None);
}

#[test]
fn failed_atomic_write_preserves_the_previous_file() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("playtime.json");
    fs::write(&file, b"previous-playtime-state").unwrap();

    let result: Result<(), atomicwrites::Error<io::Error>> = AtomicFile::new(&file, AllowOverwrite)
        .write(|output| {
            output.write_all(b"partial-replacement")?;
            Err(io::Error::other("simulated interrupted write"))
        });
    assert!(result.is_err());
    assert_eq!(fs::read(&file).unwrap(), b"previous-playtime-state");
}

#[test]
fn invalid_playtime_is_backed_up_before_empty_stats_are_reinitialized() {
    let temp = tempdir().unwrap();
    let file = temp.path().join("playtime.json");
    let corrupt = b"{broken playtime";
    fs::write(&file, corrupt).unwrap();

    let (stats, active) = stats_file(&file, 1_700_000_000_000).unwrap();

    assert!(!active && !stats.in_game);
    assert_eq!(stats.total_ms, 0);
    assert!(stats.sessions.is_empty());
    let saved: PlaytimeFile = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(saved.total_ms, 0);
    let backups = fs::read_dir(temp.path())
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|candidate| {
            candidate
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("playtime.json.corrupt-")
        })
        .collect::<Vec<_>>();
    assert_eq!(backups.len(), 1);
    assert_eq!(fs::read(&backups[0]).unwrap(), corrupt);
}

#[test]
fn user_data_path_matches_electron_on_supported_platforms() {
    let windows = legacy_user_data_dir_for(
        LegacyPlatform::Windows,
        LegacyEnvironment {
            app_data: Some(OsStr::new(r"C:\Users\Player\AppData\Roaming")),
            ..LegacyEnvironment::default()
        },
    )
    .unwrap();
    let mac = legacy_user_data_dir_for(
        LegacyPlatform::MacOs,
        LegacyEnvironment {
            home: Some(OsStr::new("/Users/player")),
            ..LegacyEnvironment::default()
        },
    )
    .unwrap();
    let linux_xdg = legacy_user_data_dir_for(
        LegacyPlatform::Linux,
        LegacyEnvironment {
            xdg_config: Some(OsStr::new("/mnt/config")),
            ..LegacyEnvironment::default()
        },
    )
    .unwrap();
    let linux_home = legacy_user_data_dir_for(
        LegacyPlatform::Linux,
        LegacyEnvironment {
            home: Some(OsStr::new("/home/player")),
            ..LegacyEnvironment::default()
        },
    )
    .unwrap();

    assert_eq!(
        normalize(windows),
        "C:/Users/Player/AppData/Roaming/natux-world-launcher"
    );
    assert_eq!(
        normalize(mac),
        "/Users/player/Library/Application Support/natux-world-launcher"
    );
    assert_eq!(normalize(linux_xdg), "/mnt/config/natux-world-launcher");
    assert_eq!(
        normalize(linux_home),
        "/home/player/.config/natux-world-launcher"
    );
}
