use std::fs;

use serde_json::Value;
use tempfile::tempdir;

use super::{offline_uuid, valid_username, OfflineAuthService};

#[test]
fn offline_uuid_matches_node_legacy_vectors() {
    assert_eq!(
        offline_uuid("Notch"),
        "b50ad385-829d-3141-a216-7e7d7539ba7f"
    );
    assert_eq!(
        offline_uuid("Steve"),
        "5627dd98-e6be-3c21-b8a8-e92344183641"
    );
    assert_eq!(offline_uuid("Alex"), "36532b5e-c442-3dbb-a24c-c7e55d0f979a");
}

#[test]
fn username_validation_matches_the_legacy_ascii_pattern() {
    for username in ["Ab_", "a123456789012345", "Player_7"] {
        assert!(
            valid_username(username),
            "expected {username:?} to be valid"
        );
    }
    for username in [
        "ab",
        "a1234567890123456",
        "has space",
        "dashed-name",
        "玩家",
    ] {
        assert!(
            !valid_username(username),
            "expected {username:?} to be invalid"
        );
    }
}

#[test]
fn login_writes_the_legacy_profile_to_minecraft_auth_json() {
    let temp = tempdir().expect("temporary directory");
    let minecraft_dir = temp.path().join("userData").join("minecraft");
    let service = OfflineAuthService::new(minecraft_dir.clone());

    let user = service.login("Notch").expect("offline login");

    assert_eq!(user.uuid, "b50ad385-829d-3141-a216-7e7d7539ba7f");
    let auth_file = minecraft_dir.join("auth.json");
    let saved: Value =
        serde_json::from_slice(&fs::read(auth_file).expect("auth file")).expect("valid JSON");
    assert_eq!(saved["uuid"], user.uuid);
    assert_eq!(saved["username"], "Notch");
    assert_eq!(saved["accessToken"], "0");
    assert_eq!(saved["type"], "offline");
    assert_eq!(saved.as_object().expect("JSON object").len(), 4);
    assert_eq!(service.get_user(), Some(user));
}

#[test]
fn sync_verified_username_keeps_online_credentials_out_of_legacy_profile() {
    let temp = tempdir().expect("temporary directory");
    let minecraft_dir = temp.path().join("userData").join("minecraft");
    let service = OfflineAuthService::new(minecraft_dir.clone());

    let profile = service
        .sync_verified_username("Natux")
        .expect("verified account username sync");
    let auth_file = minecraft_dir.join("auth.json");
    let saved: Value =
        serde_json::from_slice(&fs::read(auth_file).expect("auth file")).expect("valid JSON");

    assert_eq!(profile.username, "Natux");
    assert_eq!(profile.uuid, offline_uuid("Natux"));
    assert_eq!(saved["username"], "Natux");
    assert_eq!(saved["uuid"], offline_uuid("Natux"));
    assert_eq!(saved["accessToken"], "0");
    assert_eq!(saved["type"], "offline");
    assert_eq!(saved.as_object().expect("JSON object").len(), 4);
}

#[test]
fn invalid_login_does_not_create_or_change_auth_file() {
    let temp = tempdir().expect("temporary directory");
    let minecraft_dir = temp.path().join("minecraft");
    let service = OfflineAuthService::new(minecraft_dir.clone());

    assert!(service.login("invalid name").is_err());
    assert!(!minecraft_dir.exists());
}

#[cfg(unix)]
#[test]
fn login_does_not_follow_a_symlinked_minecraft_directory() {
    use std::os::unix::fs::symlink;

    let temp = tempdir().expect("temporary directory");
    let target = temp.path().join("outside");
    fs::create_dir_all(&target).expect("outside directory");
    let minecraft_dir = temp.path().join("minecraft");
    symlink(&target, &minecraft_dir).expect("Minecraft directory symlink");
    let service = OfflineAuthService::new(minecraft_dir);

    assert!(service.login("Notch").is_err());
    assert!(!target.join("auth.json").exists());
}

#[test]
fn logout_removes_only_the_auth_file_and_is_idempotent() {
    let temp = tempdir().expect("temporary directory");
    let minecraft_dir = temp.path().join("minecraft");
    fs::create_dir_all(&minecraft_dir).expect("Minecraft directory");
    fs::write(minecraft_dir.join("keep.json"), "keep me").expect("neighbor file");
    fs::write(minecraft_dir.join("auth.json"), "{}\n").expect("auth file");
    let service = OfflineAuthService::new(minecraft_dir.clone());

    service.logout().expect("logout");
    service.logout().expect("repeated logout");

    assert!(!minecraft_dir.join("auth.json").exists());
    assert_eq!(
        fs::read_to_string(minecraft_dir.join("keep.json")).unwrap(),
        "keep me"
    );
}
