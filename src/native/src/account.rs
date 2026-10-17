mod transport;
mod types;
mod validation;

pub use types::*;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;

use self::transport::{
    ApiRequest, ApiTransport, CredentialBackend, CredentialRecord, ReqwestTransport,
    SystemCredentialStore, TransportFailure,
};
pub(crate) use self::types::GameSessionCredentials;
use self::types::{error_result, ApiError};
use self::validation::{
    parse_api_error, parse_credential_record, parse_game_session, parse_session, parse_user,
};

#[derive(Clone)]
struct StoredSession {
    token: String,
    user: AccountUser,
}

#[derive(Clone)]
struct ActiveSession {
    session: StoredSession,
    persistent: bool,
}

pub struct AccountService {
    transport: Arc<dyn ApiTransport>,
    credentials: Arc<dyn CredentialBackend>,
    legacy_account_file: Option<PathBuf>,
    session: Mutex<Option<ActiveSession>>,
}

impl AccountService {
    pub fn new(legacy_account_file: PathBuf, install_id: &str) -> Result<Self, reqwest::Error> {
        Ok(Self::with_parts_and_legacy_file(
            Arc::new(ReqwestTransport::new(crate::brand::auth_api().to_owned())?),
            Arc::new(SystemCredentialStore::for_profile(install_id)),
            Some(legacy_account_file),
        ))
    }

    #[cfg(test)]
    fn with_parts(
        transport: Arc<dyn ApiTransport>,
        credentials: Arc<dyn CredentialBackend>,
    ) -> Self {
        Self::with_parts_and_legacy_file(transport, credentials, None)
    }

    fn with_parts_and_legacy_file(
        transport: Arc<dyn ApiTransport>,
        credentials: Arc<dyn CredentialBackend>,
        legacy_account_file: Option<PathBuf>,
    ) -> Self {
        Self {
            transport,
            credentials,
            legacy_account_file,
            session: Mutex::new(None),
        }
    }

    fn clear_legacy_session(&self) -> Result<(), String> {
        let Some(path) = &self.legacy_account_file else {
            return Ok(());
        };
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(LEGACY_CREDENTIAL_CLEAR_ERROR.to_owned()),
        }
    }

    fn session_lock(&self) -> MutexGuard<'_, Option<ActiveSession>> {
        self.session
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    fn load_session(&self) -> Option<ActiveSession> {
        if let Some(session) = self.session_lock().clone() {
            return Some(session);
        }
        let raw = self.credentials.read().ok().flatten()?;
        let record = match parse_credential_record(&raw) {
            Some(record) => record,
            None => {
                let _ = self.credentials.clear();
                return None;
            }
        };
        let session = ActiveSession {
            session: StoredSession {
                token: record.token,
                user: record.user,
            },
            persistent: true,
        };
        *self.session_lock() = Some(session.clone());
        Some(session)
    }

    fn save_session(&self, session: StoredSession) -> Result<bool, String> {
        // Electron encrypts its account.json with an app-specific safeStorage
        // format. Once Tauri accepts a new session, discard that stale session
        // before it can be restored by Electron after rollback.
        self.clear_legacy_session()?;
        let record = CredentialRecord {
            token: session.token.clone(),
            user: session.user.clone(),
        };
        // A credential backend failure leaves this account available only until the
        // launcher closes. Try to remove any prior account so a failed account switch
        // cannot silently restore the previous user on the next run.
        let persistent = serde_json::to_string(&record)
            .ok()
            .is_some_and(|raw| self.credentials.write(&raw).is_ok());
        if !persistent {
            let _ = self.credentials.clear();
        }
        *self.session_lock() = Some(ActiveSession {
            session,
            persistent,
        });
        Ok(persistent)
    }

    fn clear_session(&self) -> Result<(), String> {
        self.credentials
            .clear()
            .map_err(|_| CREDENTIAL_CLEAR_ERROR.to_owned())?;
        *self.session_lock() = None;
        Ok(())
    }

    fn discard_invalid_session(&self) {
        *self.session_lock() = None;
        let _ = self.credentials.clear();
    }

    async fn request(&self, request: ApiRequest) -> Result<Value, ApiError> {
        let response = self
            .transport
            .send(request)
            .await
            .map_err(|failure| match failure {
                TransportFailure::Timeout => ApiError::local("timeout", "Превышено время ожидания"),
                TransportFailure::Network => ApiError::local("network", "Нет связи с сервером"),
                TransportFailure::BodyTooLarge => {
                    ApiError::local("response_too_large", "Ответ сервера слишком большой")
                }
            })?;
        if !(200..300).contains(&response.status) {
            return Err(parse_api_error(response));
        }
        serde_json::from_slice(&response.body)
            .map_err(|_| ApiError::local("invalid_response", "Некорректный ответ сервера"))
    }

    pub async fn bootstrap(&self) -> BootstrapResult {
        let Some(mut active) = self.load_session() else {
            return BootstrapResult::Guest;
        };
        let result = self
            .request(ApiRequest::get("/me", Some(active.session.token.clone())))
            .await;
        match result {
            Ok(value) => match value.get("user").cloned().and_then(parse_user) {
                Some(user) => {
                    active.session.user = user.clone();
                    let previous_persistence = (!active.persistent).then_some(false);
                    match self.save_session(active.session) {
                        Ok(persistent) => BootstrapResult::Authed {
                            user,
                            session_persisted: (!persistent).then_some(false),
                        },
                        Err(error) => BootstrapResult::Offline {
                            user,
                            error,
                            session_persisted: previous_persistence,
                        },
                    }
                }
                None => BootstrapResult::Offline {
                    user: active.session.user,
                    error: "Некорректный ответ сервера".to_owned(),
                    session_persisted: (!active.persistent).then_some(false),
                },
            },
            Err(error) if matches!(error.status, Some(401 | 403)) => {
                self.discard_invalid_session();
                BootstrapResult::Guest
            }
            Err(error) => BootstrapResult::Offline {
                user: active.session.user,
                error: error.message,
                session_persisted: (!active.persistent).then_some(false),
            },
        }
    }

    pub async fn register(&self, request: RegisterRequest) -> AccountResult<()> {
        match self.request(ApiRequest::post("/register", request)).await {
            Ok(_) => AccountResult::success(()),
            Err(error) => error_result(error),
        }
    }

    pub async fn verify(&self, request: VerifyRequest) -> AccountResult<AccountUser> {
        let result = self
            .request(ApiRequest::post("/verify-email", request))
            .await
            .and_then(parse_session);
        match result {
            Ok(session) => {
                let user = session.user.clone();
                match self.save_session(session) {
                    Ok(persistent) => AccountResult::session_success(user, persistent),
                    Err(error) => {
                        error_result(ApiError::local("credential_cleanup_failed", &error))
                    }
                }
            }
            Err(error) => error_result(error),
        }
    }

    pub async fn resend(&self, request: ResendRequest) -> AccountResult<()> {
        match self
            .request(ApiRequest::post("/resend-code", request))
            .await
        {
            Ok(_) => AccountResult::success(()),
            Err(error) => error_result(error),
        }
    }

    pub async fn login(&self, request: LoginRequest) -> AccountResult<LoginOutcome> {
        let mut session_persisted = None;
        let result = self
            .request(ApiRequest::post("/login", request))
            .await
            .and_then(|value| {
                if value.get("twoFactorRequired").and_then(Value::as_bool) == Some(true) {
                    let challenge = value
                        .get("challenge")
                        .and_then(Value::as_str)
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| {
                            ApiError::local("invalid_response", "Некорректный ответ сервера")
                        })?;
                    let method = value
                        .get("method")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    Ok(LoginOutcome::Challenge {
                        two_factor: true,
                        method,
                        challenge: challenge.to_owned(),
                    })
                } else {
                    parse_session(value).and_then(|session| {
                        let user = session.user.clone();
                        let persistent = self.save_session(session).map_err(|error| {
                            ApiError::local("credential_cleanup_failed", &error)
                        })?;
                        session_persisted = Some(persistent);
                        Ok(LoginOutcome::Session {
                            two_factor: false,
                            user,
                        })
                    })
                }
            });
        match result {
            Ok(outcome) => match session_persisted {
                Some(persistent) => AccountResult::session_success(outcome, persistent),
                None => AccountResult::success(outcome),
            },
            Err(error) => error_result(error),
        }
    }

    pub async fn login_two_factor(
        &self,
        request: LoginTwoFactorRequest,
    ) -> AccountResult<LoginOutcome> {
        let result = self
            .request(ApiRequest::post("/login/2fa", request))
            .await
            .and_then(parse_session);
        match result {
            Ok(session) => {
                let user = session.user.clone();
                let persistent = match self.save_session(session) {
                    Ok(persistent) => persistent,
                    Err(error) => {
                        return error_result(ApiError::local("credential_cleanup_failed", &error));
                    }
                };
                AccountResult::session_success(
                    LoginOutcome::Session {
                        two_factor: false,
                        user,
                    },
                    persistent,
                )
            }
            Err(error) => error_result(error),
        }
    }

    pub async fn two_factor_setup(
        &self,
        request: TwoFactorSetupRequest,
    ) -> AccountResult<TwoFactorSetup> {
        let Some(session) = self.load_session() else {
            return error_result(ApiError::local("token_invalid", "Сессия истекла"));
        };
        if request
            .code
            .as_ref()
            .is_some_and(|code| code.trim().is_empty() || code.len() > 64)
        {
            return error_result(ApiError::local("bad_request", "Некорректный код"));
        }
        let body = request.code.map(|code| serde_json::json!({ "code": code }));
        let result = self
            .request(ApiRequest::authenticated_post(
                "/2fa/totp/setup",
                body,
                &session.session.token,
            ))
            .await
            .and_then(|value| {
                serde_json::from_value(value)
                    .map_err(|_| ApiError::local("invalid_response", "Некорректный ответ сервера"))
            });
        match result {
            Ok(data) => AccountResult::success(data),
            Err(error) => error_result(error),
        }
    }

    pub async fn two_factor_enable(
        &self,
        request: TwoFactorEnableRequest,
    ) -> AccountResult<TwoFactorEnabled> {
        let Some(session) = self.load_session() else {
            return error_result(ApiError::local("token_invalid", "Сессия истекла"));
        };
        let result = self
            .request(ApiRequest::authenticated_post(
                "/2fa/totp/enable",
                Some(request),
                &session.session.token,
            ))
            .await
            .and_then(|value| {
                serde_json::from_value(value)
                    .map_err(|_| ApiError::local("invalid_response", "Некорректный ответ сервера"))
            });
        match result {
            Ok(data) => {
                // The server increments tokenVersion after enabling or replacing
                // the factor, so this session is invalid even if keyring deletion
                // is temporarily unavailable.
                self.discard_invalid_session();
                AccountResult::success(data)
            }
            Err(error) => error_result(error),
        }
    }

    // The next Rust launcher module consumes this internal result; never register it as a Tauri command.
    #[allow(dead_code)]
    pub(crate) async fn game_session(&self) -> AccountResult<GameSessionCredentials> {
        let Some(session) = self.load_session() else {
            return error_result(ApiError::local("token_invalid", "Сессия истекла"));
        };
        let result = self
            .request(ApiRequest::authenticated_post(
                "/game-session",
                None::<Value>,
                &session.session.token,
            ))
            .await
            .and_then(|value| parse_game_session(value, &session.session.user.username));
        match result {
            Ok(credentials) => AccountResult::success(credentials),
            Err(error) => {
                // The launcher contract clears an expired session on 401 only.
                // A 403 can be an account-state denial; let bootstrap make the
                // authoritative 401/403 decision instead of discarding it here.
                if error.status == Some(401) {
                    self.discard_invalid_session();
                }
                error_result(error)
            }
        }
    }

    pub fn logout(&self) -> LogoutResult {
        if let Err(error) = self.clear_legacy_session() {
            return LogoutResult::failure(error);
        }
        match self.clear_session() {
            Ok(()) => LogoutResult::success(),
            Err(error) => LogoutResult::failure(error),
        }
    }

    pub async fn logout_global(&self) -> LogoutResult {
        if let Err(error) = self.clear_legacy_session() {
            return LogoutResult::failure(error);
        }
        if let Some(session) = self.load_session() {
            // Remote revocation is best-effort; local credentials are always cleared.
            let _ = self
                .request(ApiRequest::authenticated_post(
                    "/logout",
                    None::<serde_json::Value>,
                    &session.session.token,
                ))
                .await;
        }
        match self.clear_session() {
            Ok(()) => LogoutResult::success(),
            Err(error) => LogoutResult::failure(error),
        }
    }
}

const CREDENTIAL_CLEAR_ERROR: &str =
    "Не удалось очистить сессию в защищённом хранилище. Повторите выход.";
const LEGACY_CREDENTIAL_CLEAR_ERROR: &str =
    "Не удалось удалить старую сессию лаунчера. Повторите действие.";

#[derive(serde::Serialize)]
pub struct LogoutResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl LogoutResult {
    fn success() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }

    fn failure(error: String) -> Self {
        Self {
            ok: false,
            error: Some(error),
        }
    }
}

#[cfg(test)]
mod tests;
