use std::fs;
use std::sync::Arc;

use serde_json::json;
use tempfile::tempdir;

use super::*;

#[test]
fn successful_tauri_login_removes_stale_electron_session_before_saving_the_new_account() {
    let temp = tempdir().unwrap();
    let legacy_file = temp.path().join("account.json");
    fs::write(
        &legacy_file,
        r#"{"token":"old-electron-ciphertext","enc":true,"user":{"id":"account-a"}}"#,
    )
    .unwrap();
    let credentials = Arc::new(MemoryCredentials::new(None));
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"token":"tauri-account-b-token","user":user()}),
    )]));
    let service = service_with_legacy_file(transport, credentials.clone(), legacy_file.clone());

    let result = run(service.login(LoginRequest {
        login: "account-b".into(),
        password: "test-password".into(),
    }));

    assert!(matches!(result, AccountResult::Success { ok: true, .. }));
    assert!(
        !legacy_file.exists(),
        "Electron must not restore the old account after rollback"
    );
    let saved = credentials.value.lock().unwrap().clone().unwrap();
    assert!(saved.contains("tauri-account-b-token"));
    assert!(!saved.contains("old-electron-ciphertext"));
}

#[test]
fn login_fails_closed_when_stale_electron_session_cannot_be_removed() {
    let temp = tempdir().unwrap();
    let legacy_path = temp.path().join("account.json");
    fs::create_dir(&legacy_path).unwrap();
    let credentials = Arc::new(MemoryCredentials::new(None));
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"token":"tauri-account-b-token","user":user()}),
    )]));
    let service = service_with_legacy_file(transport, credentials.clone(), legacy_path.clone());

    let result = serde_json::to_value(run(service.login(LoginRequest {
        login: "account-b".into(),
        password: "test-password".into(),
    })))
    .unwrap();

    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "credential_cleanup_failed");
    assert!(credentials.value.lock().unwrap().is_none());
    assert!(legacy_path.is_dir());
}

#[test]
fn bootstrap_does_not_report_an_account_authed_while_old_electron_session_remains() {
    let temp = tempdir().unwrap();
    let legacy_path = temp.path().join("account.json");
    fs::create_dir(&legacy_path).unwrap();
    let credentials = Arc::new(MemoryCredentials::new(Some(stored("tauri-token", user()))));
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"user":user()}),
    )]));
    let service = service_with_legacy_file(transport, credentials.clone(), legacy_path.clone());

    let result = serde_json::to_value(run(service.bootstrap())).unwrap();

    assert_eq!(result["status"], "offline");
    assert_eq!(
        result["error"],
        "Не удалось удалить старую сессию лаунчера. Повторите действие."
    );
    assert!(credentials.value.lock().unwrap().is_some());
    assert!(legacy_path.is_dir());
}
