use serde_json::json;

use super::{
    response, run, service, stored, user, AccountResult, AccountService, MemoryCredentials,
    StubTransport, TOKEN,
};
use crate::account::transport::{
    CredentialBackend, CredentialFailure, HttpMethod, TransportFailure,
};
use std::sync::Mutex;

struct FailingClearCredentials {
    value: Mutex<Option<String>>,
}

impl FailingClearCredentials {
    fn new(value: Option<String>) -> Self {
        Self {
            value: Mutex::new(value),
        }
    }
}

impl CredentialBackend for FailingClearCredentials {
    fn read(&self) -> Result<Option<String>, CredentialFailure> {
        Ok(self.value.lock().unwrap().clone())
    }

    fn write(&self, value: &str) -> Result<(), CredentialFailure> {
        *self.value.lock().unwrap() = Some(value.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<(), CredentialFailure> {
        Err(CredentialFailure::Unavailable)
    }
}

#[test]
fn game_session_uses_saved_bearer_and_returns_validated_native_credentials() {
    let transport = std::sync::Arc::new(StubTransport::new(vec![response(
        200,
        json!({
            "accessToken":"0123456789abcdef0123456789abcdef",
            "clientToken":"abcdef0123456789abcdef0123456789",
            "uuid":"0123456789abcdef0123456789abcdef",
            "username":"Natux"
        }),
    )]));
    let credentials = std::sync::Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let service = service(transport.clone(), credentials);

    let game = match run(service.game_session()) {
        AccountResult::Success { data, .. } => data,
        AccountResult::Failure { error, .. } => panic!("unexpected API error: {}", error.code),
    };
    assert_eq!(game.access_token, "0123456789abcdef0123456789abcdef");
    assert_eq!(game.client_token, "abcdef0123456789abcdef0123456789");
    assert_eq!(game.uuid, "0123456789abcdef0123456789abcdef");
    assert_eq!(game.username, "Natux");

    let requests = transport.take_requests();
    assert_eq!(requests.len(), 1);
    assert!(matches!(requests[0].method, HttpMethod::Post));
    assert_eq!(requests[0].path, "/game-session");
    assert_eq!(requests[0].body, None);
    assert_eq!(requests[0].token.as_deref(), Some(TOKEN));
}

#[test]
fn game_session_401_clears_session_but_403_keeps_it_for_authoritative_bootstrap() {
    for (status, code) in [(401, "token_invalid"), (403, "unauthorized")] {
        let transport = std::sync::Arc::new(StubTransport::new(vec![response(
            status,
            json!({"error":{"code":code,"message":"Сессия недействительна"}}),
        )]));
        let credentials = std::sync::Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
        let service = service(transport, credentials.clone());

        match run(service.game_session()) {
            AccountResult::Failure { ok, error } => {
                assert!(!ok);
                assert_eq!(error.code, code);
                assert_eq!(error.message, "Сессия недействительна");
            }
            AccountResult::Success { .. } => panic!("expected auth failure"),
        }
        if status == 401 {
            assert_eq!(*credentials.value.lock().unwrap(), None);
        } else {
            // Electron's launcher clears only a 401 game-session response. A
            // 403 account-state denial remains cached until /me decides the
            // session is invalid during bootstrap.
            assert!(credentials.value.lock().unwrap().is_some());
        }
    }
}

#[test]
fn invalid_game_session_shape_returns_safe_error_and_keeps_account_session() {
    let transport = std::sync::Arc::new(StubTransport::new(vec![response(
        200,
        json!({
            "accessToken":"token-with-invalid-format",
            "clientToken":"abcdef0123456789abcdef0123456789",
            "uuid":"not-a-uuid",
            "username":"OtherPlayer"
        }),
    )]));
    let credentials = std::sync::Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let service = service(transport, credentials.clone());

    match run(service.game_session()) {
        AccountResult::Failure { ok, error } => {
            assert!(!ok);
            assert_eq!(error.code, "invalid_response");
            assert!(!error.message.contains("token-with-invalid-format"));
        }
        AccountResult::Success { .. } => panic!("expected response validation failure"),
    }
    assert!(credentials.value.lock().unwrap().is_some());
}

#[test]
fn game_session_dto_is_not_serializable_or_registered_as_a_tauri_command() {
    let types_source = include_str!("../types.rs");
    let declaration_start = types_source
        .find("pub(crate) struct GameSessionCredentials")
        .expect("native DTO declaration");
    let preceding_source = &types_source[..declaration_start];
    let derive = preceding_source
        .lines()
        .rev()
        .find(|line| line.trim_start().starts_with("#[derive("))
        .expect("DTO derive annotation");
    assert!(!derive.contains("Serialize"));
    assert!(!types_source.contains("Serialize for GameSessionCredentials"));

    let commands_source = include_str!("../../commands.rs");
    let registry_source = include_str!("../../lib.rs");
    assert!(!commands_source.contains("game_session"));
    assert!(!registry_source.contains("game_session"));
}

#[test]
fn game_session_transport_errors_use_existing_account_envelope() {
    let transport = std::sync::Arc::new(StubTransport::new(vec![Err(TransportFailure::Timeout)]));
    let credentials = std::sync::Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let service = service(transport, credentials);

    match run(service.game_session()) {
        AccountResult::Failure { ok, error } => {
            assert!(!ok);
            assert_eq!(error.code, "timeout");
            assert!(!error.message.is_empty());
        }
        AccountResult::Success { .. } => panic!("expected transport failure"),
    }
}

#[test]
fn failed_session_persistence_is_reported_without_exposing_the_token() {
    let transport = std::sync::Arc::new(StubTransport::new(vec![
        response(200, json!({"token":TOKEN,"user":user()})),
        Err(TransportFailure::Network),
    ]));
    let credentials = std::sync::Arc::new(MemoryCredentials::failing_write(None));
    let service = service(transport, credentials.clone());

    let login = serde_json::to_value(run(service.login(crate::account::LoginRequest {
        login: "Natux".into(),
        password: "test-only-password".into(),
    })))
    .unwrap();
    assert_eq!(login["ok"], true);
    assert_eq!(login["sessionPersisted"], false);
    assert!(!login.to_string().contains(TOKEN));

    let bootstrap = serde_json::to_value(run(service.bootstrap())).unwrap();
    assert_eq!(bootstrap["status"], "offline");
    assert_eq!(bootstrap["sessionPersisted"], false);
    assert_eq!(*credentials.value.lock().unwrap(), None);
}

#[test]
fn logout_does_not_report_success_or_drop_the_session_when_credential_clear_fails() {
    let transport = std::sync::Arc::new(StubTransport::new(vec![
        response(200, json!({"user":user()})),
        response(200, json!({"user":user()})),
        response(200, json!({"ok":true})),
    ]));
    let credentials =
        std::sync::Arc::new(FailingClearCredentials::new(Some(stored(TOKEN, user()))));
    let service = AccountService::with_parts(transport.clone(), credentials.clone());

    assert!(matches!(
        run(service.bootstrap()),
        crate::account::BootstrapResult::Authed { .. }
    ));
    let local = serde_json::to_value(service.logout()).unwrap();
    assert_eq!(local["ok"], false);
    assert!(local["error"]
        .as_str()
        .unwrap()
        .contains("защищённом хранилище"));
    assert!(credentials.value.lock().unwrap().is_some());
    assert!(matches!(
        run(service.bootstrap()),
        crate::account::BootstrapResult::Authed { .. }
    ));

    let global = serde_json::to_value(run(service.logout_global())).unwrap();
    assert_eq!(global["ok"], false);
    assert!(credentials.value.lock().unwrap().is_some());
    assert_eq!(transport.take_requests().last().unwrap().path, "/logout");
}
