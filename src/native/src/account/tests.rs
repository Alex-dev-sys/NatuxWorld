use std::collections::VecDeque;
use std::fs;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tempfile::tempdir;

use super::transport::{
    ApiRequest, ApiResponse, ApiTransport, CredentialBackend, CredentialFailure, TransportFailure,
};
use super::*;

const TOKEN: &str = "jwt-secret-that-must-not-reach-renderer";

struct StubTransport {
    replies: Mutex<VecDeque<Result<ApiResponse, TransportFailure>>>,
    requests: Mutex<Vec<ApiRequest>>,
}

impl StubTransport {
    fn new(replies: Vec<Result<ApiResponse, TransportFailure>>) -> Self {
        Self {
            replies: Mutex::new(replies.into()),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn take_requests(&self) -> Vec<ApiRequest> {
        std::mem::take(&mut *self.requests.lock().unwrap())
    }
}

impl ApiTransport for StubTransport {
    fn send<'a>(
        &'a self,
        request: ApiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<ApiResponse, TransportFailure>> + Send + 'a>> {
        self.requests.lock().unwrap().push(request);
        let reply = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Err(TransportFailure::Network));
        Box::pin(async move { reply })
    }
}

struct MemoryCredentials {
    value: Mutex<Option<String>>,
    available: bool,
    fail_write: bool,
}

impl MemoryCredentials {
    fn new(value: Option<String>) -> Self {
        Self {
            value: Mutex::new(value),
            available: true,
            fail_write: false,
        }
    }

    fn failing_write(value: Option<String>) -> Self {
        Self {
            value: Mutex::new(value),
            available: true,
            fail_write: true,
        }
    }

    fn unavailable() -> Self {
        Self {
            value: Mutex::new(None),
            available: false,
            fail_write: false,
        }
    }
}

impl CredentialBackend for MemoryCredentials {
    fn read(&self) -> Result<Option<String>, CredentialFailure> {
        self.available
            .then(|| self.value.lock().unwrap().clone())
            .ok_or(CredentialFailure::Unavailable)
    }

    fn write(&self, value: &str) -> Result<(), CredentialFailure> {
        if !self.available || self.fail_write {
            return Err(CredentialFailure::Unavailable);
        }
        *self.value.lock().unwrap() = Some(value.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<(), CredentialFailure> {
        if !self.available {
            return Err(CredentialFailure::Unavailable);
        }
        *self.value.lock().unwrap() = None;
        Ok(())
    }
}

fn user() -> AccountUser {
    AccountUser {
        id: "u_test".into(),
        username: "Natux".into(),
        email: "player@example.test".into(),
        two_factor_enabled: None,
        two_factor_method: None,
    }
}

fn response(status: u16, body: Value) -> Result<ApiResponse, TransportFailure> {
    Ok(ApiResponse {
        status,
        body: serde_json::to_vec(&body).unwrap(),
    })
}

fn stored(token: &str, user: AccountUser) -> String {
    serde_json::to_string(&json!({ "token": token, "user": user })).unwrap()
}

fn service(transport: Arc<StubTransport>, credentials: Arc<MemoryCredentials>) -> AccountService {
    AccountService::with_parts(transport, credentials)
}

fn service_with_legacy_file(
    transport: Arc<StubTransport>,
    credentials: Arc<MemoryCredentials>,
    legacy_account_file: PathBuf,
) -> AccountService {
    AccountService::with_parts_and_legacy_file(transport, credentials, Some(legacy_account_file))
}

fn run<F: Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

#[test]
fn authenticated_two_factor_commands_send_bearer_and_clear_after_enable() {
    let transport = Arc::new(StubTransport::new(vec![
        response(
            200,
            json!({"otpauthUri":"otpauth://totp/Natux","qr":"data:image/png;base64,qr"}),
        ),
        response(
            200,
            json!({"otpauthUri":"otpauth://totp/Natux","qr":"data:image/png;base64,qr"}),
        ),
        response(200, json!({"ok":true,"backupCodes":["backup-1"]})),
    ]));
    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let service = service(transport.clone(), credentials.clone());
    let setup = run(service.two_factor_setup(TwoFactorSetupRequest { code: None }));
    let setup_json = serde_json::to_value(setup).unwrap();
    assert_eq!(setup_json["data"]["qr"], "data:image/png;base64,qr");
    assert!(!setup_json.to_string().contains(TOKEN));
    let re_setup = run(service.two_factor_setup(TwoFactorSetupRequest {
        code: Some("654321".into()),
    }));
    assert!(matches!(re_setup, AccountResult::Success { .. }));
    let enabled = run(service.two_factor_enable(TwoFactorEnableRequest {
        code: "123456".into(),
    }));
    assert_eq!(
        serde_json::to_value(enabled).unwrap()["data"]["backupCodes"][0],
        "backup-1"
    );
    assert_eq!(*credentials.value.lock().unwrap(), None);
    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/2fa/totp/setup");
    assert_eq!(requests[0].body, None); // initial TOTP setup does not require a current code
    assert_eq!(requests[0].token.as_deref(), Some(TOKEN));
    assert_eq!(requests[1].path, "/2fa/totp/setup");
    assert_eq!(requests[1].body, Some(json!({"code":"654321"})));
    assert_eq!(requests[1].token.as_deref(), Some(TOKEN));
    assert_eq!(requests[2].path, "/2fa/totp/enable");
    assert_eq!(requests[2].body, Some(json!({"code":"123456"})));
    assert_eq!(requests[2].token.as_deref(), Some(TOKEN));
}

#[test]
fn invalid_two_factor_setup_step_up_code_is_rejected_before_network_access() {
    let transport = Arc::new(StubTransport::new(Vec::new()));
    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let result = run(service(transport.clone(), credentials).two_factor_setup(
        TwoFactorSetupRequest {
            code: Some(" ".into()),
        },
    ));

    assert_eq!(
        serde_json::to_value(result).unwrap()["error"]["code"],
        "bad_request"
    );
    assert!(transport.take_requests().is_empty());
}

#[test]
fn rejected_two_factor_step_up_codes_keep_the_saved_session_for_retry() {
    let transport = Arc::new(StubTransport::new(vec![
        response(
            401,
            json!({"error":{"code":"bad_credentials","message":"Неверный код"}}),
        ),
        response(
            401,
            json!({"error":{"code":"bad_credentials","message":"Неверный код"}}),
        ),
    ]));
    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let service = service(transport.clone(), credentials.clone());

    let setup = serde_json::to_value(run(service.two_factor_setup(TwoFactorSetupRequest {
        code: Some("wrong-step-up".into()),
    })))
    .unwrap();
    assert_eq!(setup["error"]["code"], "bad_credentials");
    assert!(!setup.to_string().contains(TOKEN));
    assert!(credentials.value.lock().unwrap().is_some());

    let enable = serde_json::to_value(run(service.two_factor_enable(TwoFactorEnableRequest {
        code: "wrong-enrollment".into(),
    })))
    .unwrap();
    assert_eq!(enable["error"]["code"], "bad_credentials");
    assert!(!enable.to_string().contains(TOKEN));
    assert!(credentials.value.lock().unwrap().is_some());

    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/2fa/totp/setup");
    assert_eq!(requests[0].body, Some(json!({"code":"wrong-step-up"})));
    assert_eq!(requests[0].token.as_deref(), Some(TOKEN));
    assert_eq!(requests[1].path, "/2fa/totp/enable");
    assert_eq!(requests[1].body, Some(json!({"code":"wrong-enrollment"})));
    assert_eq!(requests[1].token.as_deref(), Some(TOKEN));
}

#[test]
fn bootstrap_keeps_cached_user_on_timeout_network_and_server_errors() {
    let failures = [
        Err(TransportFailure::Timeout),
        Err(TransportFailure::Network),
        response(
            503,
            json!({"error":{"code":"unavailable","message":"offline"}}),
        ),
    ];
    for failure in failures {
        let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
        let transport = Arc::new(StubTransport::new(vec![failure]));
        let result = run(service(transport, credentials.clone()).bootstrap());
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["status"], "offline");
        assert_eq!(value["user"]["username"], "Natux");
        assert!(value["error"].is_string());
        assert!(credentials
            .value
            .lock()
            .unwrap()
            .as_deref()
            .unwrap()
            .contains(TOKEN));
    }
}

#[test]
fn bootstrap_clears_credentials_only_for_authoritative_401_or_403() {
    for status in [401, 403] {
        let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
        let transport = Arc::new(StubTransport::new(vec![response(
            status,
            json!({"error":{"code":"token_invalid","message":"expired"}}),
        )]));
        let result = run(service(transport, credentials.clone()).bootstrap());
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            json!({"status":"guest"})
        );
        assert_eq!(*credentials.value.lock().unwrap(), None);
    }

    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let transport = Arc::new(StubTransport::new(vec![response(500, json!({"error":{}}))]));
    let result = run(service(transport, credentials.clone()).bootstrap());
    assert_eq!(serde_json::to_value(result).unwrap()["status"], "offline");
    assert!(credentials.value.lock().unwrap().is_some());
}

#[test]
fn corrupt_or_unavailable_credential_store_fails_closed_and_ram_fallback_is_volatile() {
    let corrupt = Arc::new(MemoryCredentials::new(Some("{not json".into())));
    let transport = Arc::new(StubTransport::new(vec![]));
    let result = run(service(transport, corrupt.clone()).bootstrap());
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({"status":"guest"})
    );
    assert_eq!(*corrupt.value.lock().unwrap(), None);

    let unavailable = Arc::new(MemoryCredentials::unavailable());
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"token":TOKEN,"user":user()}),
    )]));
    let service = service(transport, unavailable.clone());
    assert!(matches!(
        run(service.login(LoginRequest {
            login: "Natux".into(),
            password: "password".into()
        })),
        AccountResult::Success { ok: true, .. }
    ));
    assert!(matches!(
        run(service.bootstrap()),
        BootstrapResult::Offline { .. }
    ));
    assert_eq!(*unavailable.value.lock().unwrap(), None);
}

#[test]
fn absent_credential_and_legacy_account_file_are_left_untouched() {
    let temp = tempdir().unwrap();
    let old_file = temp.path().join("account.json");
    let legacy_text = format!(r#"{{"token":"{TOKEN}","user":{{}}}}"#);
    fs::write(&old_file, &legacy_text).unwrap();
    let credentials = Arc::new(MemoryCredentials::new(None));
    let transport = Arc::new(StubTransport::new(vec![]));
    let result = run(service(transport, credentials).bootstrap());
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({"status":"guest"})
    );
    assert_eq!(fs::read_to_string(old_file).unwrap(), legacy_text);
}

#[test]
fn absent_legacy_storage_remains_absent() {
    let temp = tempdir().unwrap();
    let old_file = temp.path().join("account.json");
    let credentials = Arc::new(MemoryCredentials::new(None));
    let transport = Arc::new(StubTransport::new(vec![]));
    let result = run(service(transport, credentials).bootstrap());
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({"status":"guest"})
    );
    assert!(!old_file.exists());
}

#[test]
fn failed_credential_replacement_clears_stale_token_and_keeps_new_session_in_ram() {
    let credentials = Arc::new(MemoryCredentials::failing_write(Some(stored(
        "old-token",
        user(),
    ))));
    let transport = Arc::new(StubTransport::new(vec![response(
        200,
        json!({"token":"new-token","user":user()}),
    )]));
    let account_service = service(transport, credentials.clone());
    assert!(matches!(
        run(account_service.login(LoginRequest {
            login: "Natux".into(),
            password: "password".into()
        })),
        AccountResult::Success { ok: true, .. }
    ));
    assert_eq!(*credentials.value.lock().unwrap(), None);

    let next_process = service(Arc::new(StubTransport::new(vec![])), credentials);
    assert!(matches!(
        run(next_process.bootstrap()),
        BootstrapResult::Guest
    ));
    assert!(matches!(
        run(account_service.bootstrap()),
        BootstrapResult::Offline { .. }
    ));
}

#[test]
fn bridge_request_payload_uses_the_top_level_request_key() {
    #[derive(serde::Deserialize)]
    struct BridgeArgs {
        request: LoginRequest,
    }

    let args: BridgeArgs = serde_json::from_value(json!({
        "request": {"login":"Natux","password":"password"}
    }))
    .unwrap();
    assert_eq!(args.request.login, "Natux");
    assert_eq!(args.request.password, "password");
}

#[test]
fn http_errors_keep_safe_envelope_and_compile_time_origin_is_fixed() {
    let credentials = Arc::new(MemoryCredentials::new(None));
    let transport = Arc::new(StubTransport::new(vec![response(
        422,
        json!({"error":{"code":"validation_failed","message":"Проверьте данные"}}),
    )]));
    let result = run(service(transport, credentials).register(RegisterRequest {
        username: "x".into(),
        email: "x".into(),
        password: "x".into(),
    }));
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({"ok":false,"error":{"code":"validation_failed","message":"Проверьте данные"}})
    );
    #[cfg(natux_local_auth_api)]
    assert_eq!(super::AUTH_API_ORIGIN, "http://127.0.0.1:3000/api/auth");
    #[cfg(not(natux_local_auth_api))]
    assert_eq!(super::AUTH_API_ORIGIN, "https://vibestudy.ru/api/auth");
}

#[test]
fn local_logout_is_only_local_and_global_logout_always_clears_session() {
    let temp = tempdir().unwrap();
    let legacy_file = temp.path().join("account.json");
    fs::write(&legacy_file, "encrypted Electron account data").unwrap();
    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let transport = Arc::new(StubTransport::new(vec![Err(TransportFailure::Network)]));
    let service =
        service_with_legacy_file(transport.clone(), credentials.clone(), legacy_file.clone());
    assert_eq!(
        serde_json::to_value(service.logout()).unwrap(),
        json!({"ok":true})
    );
    assert!(transport.take_requests().is_empty());
    assert!(!legacy_file.exists());

    // Re-seed because local logout must have removed the only session.
    *credentials.value.lock().unwrap() = Some(stored(TOKEN, user()));
    fs::write(&legacy_file, "encrypted Electron account data").unwrap();
    assert_eq!(
        serde_json::to_value(run(service.logout_global())).unwrap(),
        json!({"ok":true})
    );
    assert_eq!(*credentials.value.lock().unwrap(), None);
    assert!(!legacy_file.exists());
    let requests = transport.take_requests();
    assert_eq!(requests[0].path, "/logout");
    assert_eq!(requests[0].token.as_deref(), Some(TOKEN));
}

#[test]
fn logout_fails_closed_if_legacy_account_path_cannot_be_removed() {
    let temp = tempdir().unwrap();
    let legacy_path = temp.path().join("account.json");
    fs::create_dir(&legacy_path).unwrap();
    let credentials = Arc::new(MemoryCredentials::new(Some(stored(TOKEN, user()))));
    let transport = Arc::new(StubTransport::new(vec![Err(TransportFailure::Network)]));
    let service = service_with_legacy_file(transport.clone(), credentials.clone(), legacy_path);

    let local = serde_json::to_value(service.logout()).unwrap();
    assert_eq!(
        local,
        json!({"ok":false,"error":"Не удалось удалить старую сессию лаунчера. Повторите действие."})
    );
    let global = serde_json::to_value(run(service.logout_global())).unwrap();
    assert_eq!(global, local);
    assert!(credentials
        .value
        .lock()
        .unwrap()
        .as_deref()
        .is_some_and(|value| value.contains(TOKEN)));
    assert!(transport.take_requests().is_empty());
}

mod auth_flows;
mod legacy_session;
mod session;
mod transport;
