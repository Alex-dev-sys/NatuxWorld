use serde_json::Value;
use std::sync::Arc;
use sysinfo::System;

use tauri::{AppHandle, Emitter, State, WebviewWindow};

use crate::settings::{LauncherSettings, SettingsStore};

#[derive(serde::Deserialize)]
pub struct OfflineAuthCredentials {
    username: String,
    #[serde(rename = "type")]
    auth_type: Option<String>,
}

#[tauri::command]
pub fn auth_login(
    settings: State<'_, SettingsStore>,
    profile_locks: State<'_, crate::ProfileLockState>,
    credentials: OfflineAuthCredentials,
) -> Result<crate::offline_auth::OfflineUser, String> {
    if credentials
        .auth_type
        .as_deref()
        .is_some_and(|auth_type| auth_type != "offline")
    {
        return Err("Only offline launcher profiles are supported".to_owned());
    }
    let _game_lock = profile_locks.acquire_game()?;
    crate::offline_auth::OfflineAuthService::from_settings(settings.inner())?
        .login(&credentials.username)
}

#[tauri::command]
pub fn auth_logout(
    settings: State<'_, SettingsStore>,
    profile_locks: State<'_, crate::ProfileLockState>,
) -> Result<(), String> {
    let _game_lock = profile_locks.acquire_game()?;
    crate::offline_auth::OfflineAuthService::from_settings(settings.inner())?.logout()
}

#[tauri::command]
pub fn auth_get_user(
    settings: State<'_, SettingsStore>,
) -> Result<Option<crate::offline_auth::OfflineUser>, String> {
    Ok(crate::offline_auth::OfflineAuthService::from_settings(settings.inner())?.get_user())
}

#[tauri::command]
pub async fn account_bootstrap(
    account: State<'_, crate::account::AccountService>,
) -> Result<crate::account::BootstrapResult, String> {
    Ok(account.bootstrap().await)
}

#[tauri::command]
pub async fn account_register(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::RegisterRequest,
) -> Result<crate::account::AccountResult<()>, String> {
    Ok(account.register(request).await)
}

#[tauri::command]
pub async fn account_verify(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::VerifyRequest,
) -> Result<crate::account::AccountResult<crate::account::AccountUser>, String> {
    Ok(account.verify(request).await)
}

#[tauri::command]
pub async fn account_resend(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::ResendRequest,
) -> Result<crate::account::AccountResult<()>, String> {
    Ok(account.resend(request).await)
}

#[tauri::command]
pub async fn account_login(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::LoginRequest,
) -> Result<crate::account::AccountResult<crate::account::LoginOutcome>, String> {
    Ok(account.login(request).await)
}

#[tauri::command]
pub async fn account_login_2fa(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::LoginTwoFactorRequest,
) -> Result<crate::account::AccountResult<crate::account::LoginOutcome>, String> {
    Ok(account.login_two_factor(request).await)
}

#[tauri::command]
pub async fn account_two_factor_setup(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::TwoFactorSetupRequest,
) -> Result<crate::account::AccountResult<crate::account::TwoFactorSetup>, String> {
    Ok(account.two_factor_setup(request).await)
}

#[tauri::command]
pub async fn account_two_factor_enable(
    account: State<'_, crate::account::AccountService>,
    request: crate::account::TwoFactorEnableRequest,
) -> Result<crate::account::AccountResult<crate::account::TwoFactorEnabled>, String> {
    Ok(account.two_factor_enable(request).await)
}

#[tauri::command]
pub fn account_logout(
    account: State<'_, crate::account::AccountService>,
) -> crate::account::LogoutResult {
    account.logout()
}

#[tauri::command]
pub async fn account_logout_global(
    account: State<'_, crate::account::AccountService>,
) -> Result<crate::account::LogoutResult, String> {
    Ok(account.logout_global().await)
}

#[tauri::command]
pub async fn launcher_play(
    app: AppHandle,
    launcher: State<'_, crate::launcher::LauncherService>,
    options: crate::launcher::PlayOptions,
    settings: State<'_, SettingsStore>,
    account: State<'_, crate::account::AccountService>,
    playtime: State<'_, Arc<crate::playtime::PlaytimeService>>,
    reporting: State<'_, Arc<crate::reporting::ReportingService>>,
) -> Result<crate::launcher::PlayResult, String> {
    Ok(launcher
        .play(
            app,
            options,
            settings.inner(),
            account.inner(),
            Arc::clone(playtime.inner()),
            Arc::clone(reporting.inner()),
        )
        .await)
}

#[tauri::command]
pub fn launcher_get_status(
    launcher: State<'_, crate::launcher::LauncherService>,
) -> crate::launcher::LaunchProgress {
    launcher.get_status()
}

#[tauri::command]
pub async fn launcher_cancel(
    launcher: State<'_, crate::launcher::LauncherService>,
) -> Result<(), String> {
    launcher.cancel_and_wait().await;
    Ok(())
}

#[tauri::command]
pub async fn java_detect(
    settings: State<'_, SettingsStore>,
) -> Result<Option<crate::java::JavaInstallation>, String> {
    let runtime_dir = settings.minecraft_dir()?.join("runtime");
    let target = crate::java::JavaTarget::current()?;
    tokio::task::spawn_blocking(move || crate::java::detect(&runtime_dir, target))
        .await
        .map_err(|_| "Java version probe failed".to_owned())
}

#[tauri::command]
pub async fn java_install(
    settings: State<'_, SettingsStore>,
    profile_locks: State<'_, crate::ProfileLockState>,
) -> Result<crate::java::JavaInstallation, String> {
    let _game_lock = profile_locks.acquire_game()?;
    let root = settings.minecraft_dir()?;
    let target = crate::java::JavaTarget::current()?;
    let release = crate::java::fetch_latest_release(target).await?;
    let job = release.download_job();
    let download =
        crate::downloads::DownloadService::new(&root).map_err(|error| error.to_string())?;
    download
        .download_many(vec![job.clone()], |_, _, _| {})
        .await
        .map_err(|error| error.to_string())?;
    let archive = root.join(job.destination);
    let runtime = root.join("runtime");
    tokio::task::spawn_blocking(move || crate::java::install_release(&archive, &runtime, &release))
        .await
        .map_err(|_| "Java installation worker failed".to_owned())?
}

#[tauri::command]
pub fn health() -> &'static str {
    "ok"
}

#[tauri::command]
pub fn get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn app_ready(app: AppHandle, settings: State<'_, SettingsStore>) -> Result<(), String> {
    let payload = serde_json::json!({
        "version": app.package_info().version.to_string(),
    });
    app.emit("app:ready", payload)
        .map_err(|error| error.to_string())?;
    crate::updater::schedule_background_checks(&app, settings.inner());
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_maximize(window: WebviewWindow) -> Result<(), String> {
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;

    if maximized {
        window.unmaximize().map_err(|error| error.to_string())?;
    } else {
        window.maximize().map_err(|error| error.to_string())?;
    }

    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    window
        .emit("window:maximized", maximized)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn settings_get(settings: State<'_, SettingsStore>) -> Result<LauncherSettings, String> {
    settings.get().map(settings_capabilities)
}

fn settings_capabilities(mut settings: LauncherSettings) -> LauncherSettings {
    settings.startup_supported = Some(crate::os_integration::autostart_supported());
    settings
}

#[tauri::command]
pub fn settings_set(
    app: AppHandle,
    state: State<'_, SettingsStore>,
    integration: State<'_, crate::os_integration::OsIntegration>,
    settings: Value,
) -> Result<LauncherSettings, String> {
    let previous = state.get()?;
    let saved = state.set(settings)?;
    if saved.launch_on_startup != previous.launch_on_startup {
        if let Err(error) = integration.apply_user_settings(&app, &saved) {
            let _ = integration.apply_user_settings(&app, &previous);
            state.set(serde_json::json!({ "launchOnStartup": previous.launch_on_startup }))?;
            return Err(error);
        }
    } else {
        integration.apply_settings(&app, &saved);
    }
    Ok(settings_capabilities(saved))
}

#[tauri::command]
pub fn settings_get_system_memory() -> u64 {
    let mut system = System::new();
    system.refresh_memory();
    system.total_memory() / (1024 * 1024)
}

#[tauri::command]
pub fn settings_reset(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    integration: State<'_, crate::os_integration::OsIntegration>,
) -> Result<LauncherSettings, String> {
    let previous = settings.get()?;
    let saved = settings.reset()?;
    if saved.launch_on_startup != previous.launch_on_startup {
        if let Err(error) = integration.apply_user_settings(&app, &saved) {
            let _ = integration.apply_user_settings(&app, &previous);
            settings.set(serde_json::json!({ "launchOnStartup": previous.launch_on_startup }))?;
            return Err(error);
        }
    } else {
        integration.apply_settings(&app, &saved);
    }
    Ok(settings_capabilities(saved))
}

#[tauri::command]
pub fn shell_playtime_get(
    playtime: State<'_, Arc<crate::playtime::PlaytimeService>>,
) -> Result<crate::playtime::PlaytimeStats, String> {
    playtime.get_stats()
}

#[tauri::command]
pub async fn news_get_all(
    public_api: State<'_, crate::public_api::PublicApiService>,
) -> Result<Vec<crate::public_api::NewsItem>, String> {
    Ok(public_api.get_all_news().await)
}

#[tauri::command]
pub async fn server_get_status(
    public_api: State<'_, crate::public_api::PublicApiService>,
) -> Result<crate::public_api::ServerStatus, String> {
    Ok(public_api.get_server_status().await)
}

#[tauri::command]
pub async fn server_get_info(
    public_api: State<'_, crate::public_api::PublicApiService>,
) -> Result<crate::public_api::ServerInfo, String> {
    Ok(public_api.get_server_info().await)
}

#[tauri::command]
pub async fn shell_diagnostics_run(
    settings: State<'_, SettingsStore>,
) -> Result<Vec<crate::diagnostics::DiagnosticCheck>, String> {
    let service = crate::diagnostics::DiagnosticsService::new(settings.minecraft_dir()?)?;
    Ok(service.run().await)
}

#[cfg(test)]
mod tests {
    use super::health;

    #[test]
    fn health_reports_ready_without_claiming_game_or_account_state() {
        assert_eq!(health(), "ok");
    }
}
