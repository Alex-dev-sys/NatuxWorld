use serde_json::Value;

use super::transport::{ApiResponse, CredentialRecord, MAX_BODY_BYTES, MAX_TOKEN_BYTES};
use super::types::{ApiError, GameSessionCredentials};
use super::{AccountUser, StoredSession};

pub(super) fn parse_session(value: Value) -> Result<StoredSession, ApiError> {
    let record = serde_json::from_value::<CredentialRecord>(value)
        .map_err(|_| ApiError::local("invalid_response", "Некорректный ответ сервера"))?;
    if record.token.is_empty() || record.token.len() > MAX_TOKEN_BYTES || !valid_user(&record.user)
    {
        return Err(ApiError::local(
            "invalid_response",
            "Некорректный ответ сервера",
        ));
    }
    Ok(StoredSession {
        token: record.token,
        user: record.user,
    })
}

pub(super) fn parse_user(value: Value) -> Option<AccountUser> {
    serde_json::from_value::<AccountUser>(value)
        .ok()
        .filter(valid_user)
}

pub(super) fn parse_game_session(
    value: Value,
    expected_username: &str,
) -> Result<GameSessionCredentials, ApiError> {
    let credentials = serde_json::from_value::<GameSessionCredentials>(value)
        .map_err(|_| ApiError::local("invalid_response", "Некорректный ответ сервера"))?;
    if !valid_game_token(&credentials.access_token)
        || !valid_game_token(&credentials.client_token)
        || credentials.uuid.len() != 32
        || !credentials
            .uuid
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || !(3..=16).contains(&credentials.username.len())
        || !credentials
            .username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        || credentials.username != expected_username
    {
        return Err(ApiError::local(
            "invalid_response",
            "Некорректный ответ сервера",
        ));
    }
    Ok(credentials)
}

fn valid_game_token(token: &str) -> bool {
    token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_user(user: &AccountUser) -> bool {
    !user.id.is_empty() && !user.username.is_empty() && !user.email.is_empty()
}

pub(super) fn parse_credential_record(raw: &str) -> Option<CredentialRecord> {
    if raw.len() > MAX_BODY_BYTES {
        return None;
    }
    let record = serde_json::from_str::<CredentialRecord>(raw).ok()?;
    if record.token.is_empty() || record.token.len() > MAX_TOKEN_BYTES || !valid_user(&record.user)
    {
        return None;
    }
    Some(record)
}

pub(super) fn parse_api_error(response: ApiResponse) -> ApiError {
    let remote = serde_json::from_slice::<Value>(&response.body).ok();
    let error = remote.as_ref().and_then(|value| value.get("error"));
    let code = error
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 128)
        .unwrap_or("unknown")
        .to_owned();
    let message = error
        .and_then(|value| value.get("message"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 512)
        .unwrap_or("Ошибка сервера")
        .to_owned();
    ApiError {
        code,
        message,
        status: Some(response.status),
    }
}
