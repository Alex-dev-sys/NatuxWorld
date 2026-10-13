use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountUser {
    pub id: String,
    pub username: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_factor_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_factor_method: Option<String>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum BootstrapResult {
    Guest,
    Authed {
        user: AccountUser,
        #[serde(rename = "sessionPersisted", skip_serializing_if = "Option::is_none")]
        session_persisted: Option<bool>,
    },
    Offline {
        user: AccountUser,
        error: String,
        #[serde(rename = "sessionPersisted", skip_serializing_if = "Option::is_none")]
        session_persisted: Option<bool>,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorDto {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum AccountResult<T> {
    Success {
        ok: bool,
        data: T,
        #[serde(rename = "sessionPersisted", skip_serializing_if = "Option::is_none")]
        session_persisted: Option<bool>,
    },
    Failure {
        ok: bool,
        error: ApiErrorDto,
    },
}

impl<T> AccountResult<T> {
    pub(super) fn success(data: T) -> Self {
        Self::Success {
            ok: true,
            data,
            session_persisted: None,
        }
    }

    pub(super) fn session_success(data: T, persisted: bool) -> Self {
        Self::Success {
            ok: true,
            data,
            session_persisted: (!persisted).then_some(false),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub email: String,
    pub code: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResendRequest {
    pub email: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub login: String,
    pub password: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginTwoFactorRequest {
    pub challenge: String,
    pub code: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorEnableRequest {
    pub code: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorSetupRequest {
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum LoginOutcome {
    Session {
        #[serde(rename = "twoFactor")]
        two_factor: bool,
        user: AccountUser,
    },
    Challenge {
        #[serde(rename = "twoFactor")]
        two_factor: bool,
        method: Option<String>,
        challenge: String,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorSetup {
    pub otpauth_uri: String,
    pub qr: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorEnabled {
    pub ok: bool,
    pub backup_codes: Vec<String>,
}

/// Native-only game credentials; intentionally not serializable for Tauri IPC.
#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GameSessionCredentials {
    pub(crate) access_token: String,
    pub(crate) client_token: String,
    pub(crate) uuid: String,
    pub(crate) username: String,
}

pub(super) struct ApiError {
    pub(super) code: String,
    pub(super) message: String,
    pub(super) status: Option<u16>,
}

impl ApiError {
    pub(super) fn local(code: &str, message: &str) -> Self {
        Self {
            code: code.to_owned(),
            message: message.to_owned(),
            status: None,
        }
    }
}

pub(super) fn error_result<T>(error: ApiError) -> AccountResult<T> {
    AccountResult::Failure {
        ok: false,
        error: ApiErrorDto {
            code: error.code,
            message: error.message,
        },
    }
}
