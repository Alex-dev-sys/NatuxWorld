mod account;
mod cancellation;
mod commands;
mod data_recovery;
mod diagnostics;
mod downloads;
mod java;
mod java_picker;
mod launcher;
mod metadata;
mod offline_auth;
mod os_integration;
mod playtime;
mod public_api;
mod reporting;
mod resources;
mod settings;
mod shell_integration;
mod updater;

use std::io;
use std::path::PathBuf;
use std::sync::Arc;

use natux_profile_lock_core::{GameLock, LockError, ProfileLock};
use tauri::{Emitter, Manager};

/// Holds the app-wide profile lock and provides short-lived Minecraft/runtime leases.
#[derive(Debug)]
pub(crate) struct ProfileLockState {
    user_data: PathBuf,
    _profile_lock: ProfileLock,
}

impl ProfileLockState {
    fn try_acquire(user_data: PathBuf) -> Result<Self, String> {
        let profile_lock = match ProfileLock::try_acquire(&user_data) {
            Ok(Some(lock)) => lock,
            Ok(None) => {
                return Err(
                    "Профиль NATUX WORLD уже используется другим лаунчером. Закройте его и повторите попытку."
                        .to_owned(),
                )
            }
            Err(LockError::AlreadyOpenInProcess(_)) => {
                return Err(
                    "Профиль NATUX WORLD уже используется другим лаунчером. Закройте его и повторите попытку."
                        .to_owned(),
                )
            }
            Err(_) => {
                return Err(
                    "Не удалось защитить данные профиля NATUX WORLD. Запуск остановлен для сохранения данных."
                        .to_owned(),
                )
            }
        };
        Ok(Self {
            user_data,
            _profile_lock: profile_lock,
        })
    }

    pub(crate) fn user_data_dir(&self) -> &std::path::Path {
        &self.user_data
    }

    pub(crate) fn acquire_game(&self) -> Result<GameLock, String> {
        match GameLock::try_acquire(&self.user_data) {
            Ok(Some(lock)) => Ok(lock),
            Ok(None) | Err(LockError::AlreadyOpenInProcess(_)) => Err(game_busy_message()),
            Err(_) => Err(
                "Не удалось защитить файлы Minecraft. Операция остановлена для сохранения данных."
                    .to_owned(),
            ),
        }
    }
}

fn game_busy_message() -> String {
    "Файлы Minecraft уже используются игрой или другой операцией. Дождитесь её завершения и повторите попытку."
        .to_owned()
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            os_integration::show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--from-autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let settings = settings::SettingsStore::from_legacy_environment()?;
            // Resolving `minecraft_dir` only derives the legacy Electron userData path;
            // the profile lock is held before settings or account files are read.
            let minecraft_dir = settings.minecraft_dir().map_err(io::Error::other)?;
            let user_data = minecraft_dir
                .parent()
                .ok_or_else(|| io::Error::other("legacy userData directory is unavailable"))?
                .to_path_buf();
            let profile_locks =
                ProfileLockState::try_acquire(user_data).map_err(io::Error::other)?;
            let initial_settings = settings.get().map_err(std::io::Error::other)?;
            let legacy_account_file = settings
                .legacy_account_file()
                .map_err(std::io::Error::other)?;
            app.manage(profile_locks);
            app.manage(settings);
            app.manage(java_picker::JavaSelectionStore::default());
            app.manage(os_integration::OsIntegration::default());
            app.manage(account::AccountService::new(
                legacy_account_file,
                &initial_settings.install_id,
            )?);
            app.manage(Arc::new(
                playtime::PlaytimeService::from_legacy_environment()?,
            ));
            app.manage(Arc::new(reporting::ReportingService::new()));
            app.manage(launcher::LauncherService::default());
            app.manage(updater::UpdaterState::default());
            app.manage(public_api::PublicApiService::new()?);

            app.state::<os_integration::OsIntegration>()
                .apply_settings(app.handle(), &initial_settings);
            if os_integration::OsIntegration::started_from_autostart() {
                let integration = app.state::<os_integration::OsIntegration>();
                let hide = os_integration::should_hide_startup_window(
                    true,
                    initial_settings.launch_on_startup,
                    initial_settings.minimize_to_tray,
                    integration.close_to_tray(),
                );
                if let Some(window) = app.get_webview_window("main") {
                    if hide {
                        let _ = window.hide();
                    } else {
                        let _ = window.unminimize();
                        let _ = window.show();
                    }
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                attach_main_window_events(app.handle(), &window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health,
            commands::get_version,
            commands::app_ready,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::window_is_maximized,
            commands::settings_get,
            commands::settings_set,
            commands::settings_get_system_memory,
            commands::settings_reset,
            java_picker::settings_pick_java,
            java_picker::settings_verify_java,
            shell_integration::shell_open_external,
            shell_integration::shell_open_screenshots,
            commands::account_bootstrap,
            commands::account_register,
            commands::account_verify,
            commands::account_resend,
            commands::account_login,
            commands::account_login_2fa,
            commands::account_two_factor_setup,
            commands::account_two_factor_enable,
            commands::account_logout,
            commands::account_logout_global,
            commands::auth_login,
            commands::auth_logout,
            commands::auth_get_user,
            commands::launcher_play,
            commands::launcher_get_status,
            commands::launcher_cancel,
            commands::java_detect,
            commands::java_install,
            commands::shell_playtime_get,
            commands::news_get_all,
            commands::server_get_status,
            commands::server_get_info,
            commands::shell_diagnostics_run,
            updater::updater_check,
            updater::updater_install,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("failed to build NATUX WORLD Tauri launcher");
    app.run(|app, event| {
        if matches!(&event, tauri::RunEvent::Exit) {
            if let Some(playtime) = app.try_state::<Arc<playtime::PlaytimeService>>() {
                if let Err(error) = playtime.end_session() {
                    eprintln!("failed to close playtime session during shutdown: {error}");
                }
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = &event
        {
            reopen_main_window(app, *has_visible_windows);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

#[cfg(test)]
mod profile_lock_tests {
    use super::ProfileLockState;

    #[test]
    fn profile_lock_blocks_a_second_launcher_and_game_lock_blocks_mutation_leases() {
        let temp = tempfile::tempdir().expect("temporary profile");
        let first = ProfileLockState::try_acquire(temp.path().to_path_buf())
            .expect("first app owns the profile");

        let second = ProfileLockState::try_acquire(temp.path().to_path_buf())
            .expect_err("second app must not read the profile");
        assert!(second.contains("уже используется"));

        let game = first.acquire_game().expect("game lock is free");
        let second_game = first
            .acquire_game()
            .expect_err("concurrent command must not touch Minecraft");
        assert!(second_game.contains("уже используются"));
        drop(game);
        assert!(first.acquire_game().is_ok());
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Eq, PartialEq)]
enum ReopenAction {
    LeaveVisibleWindowsAlone,
    ShowMainWindow,
    RecreateMainWindow,
}

#[cfg(any(target_os = "macos", test))]
fn reopen_action(has_visible_windows: bool, has_main_window: bool) -> ReopenAction {
    if has_visible_windows {
        ReopenAction::LeaveVisibleWindowsAlone
    } else if has_main_window {
        ReopenAction::ShowMainWindow
    } else {
        ReopenAction::RecreateMainWindow
    }
}

#[cfg(target_os = "macos")]
fn reopen_main_window(app: &tauri::AppHandle, has_visible_windows: bool) {
    let main_window = app.get_webview_window("main");
    match reopen_action(has_visible_windows, main_window.is_some()) {
        ReopenAction::LeaveVisibleWindowsAlone => {}
        ReopenAction::ShowMainWindow => os_integration::show_main_window(app),
        ReopenAction::RecreateMainWindow => {
            let Some(config) = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
            else {
                return;
            };
            match tauri::WebviewWindowBuilder::from_config(app, config)
                .and_then(|builder| builder.build())
            {
                Ok(window) => {
                    attach_main_window_events(app, &window);
                    os_integration::show_main_window(app);
                }
                Err(error) => eprintln!("failed to reopen NATUX WORLD main window: {error}"),
            }
        }
    }
}

fn attach_main_window_events(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let event_window = window.clone();
    let event_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(_)) {
            if let Ok(maximized) = event_window.is_maximized() {
                let _ = event_window.emit("window:maximized", maximized);
            }
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let integration = event_app.state::<os_integration::OsIntegration>();
            let hide_window = (integration.close_to_tray() && !integration.exit_requested())
                || event_app
                    .state::<launcher::LauncherService>()
                    .defer_exit_until_pipeline_finishes();
            if hide_window {
                api.prevent_close();
                let _ = event_window.hide();
            }
        }
    });
}

#[cfg(test)]
#[path = "os_integration/reopen_tests.rs"]
mod reopen_tests;
