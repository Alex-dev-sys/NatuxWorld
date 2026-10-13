use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::LauncherSettings;

const TRAY_ID: &str = "launcher-tray";

#[derive(Default)]
pub struct OsIntegration {
    apply_lock: Mutex<()>,
    tray: Mutex<Option<TrayIcon<Wry>>>,
    close_to_tray: AtomicBool,
    exit_requested: AtomicBool,
}

impl OsIntegration {
    pub fn apply_settings(&self, app: &AppHandle, settings: &LauncherSettings) {
        let _apply_guard = self
            .apply_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tray_ready = if settings.minimize_to_tray && tray_supported() {
            self.ensure_tray(app)
        } else {
            self.remove_tray(app);
            false
        };
        self.close_to_tray
            .store(settings.minimize_to_tray && tray_ready, Ordering::SeqCst);

        let autolaunch = app.autolaunch();
        if settings.launch_on_startup {
            let _ = autolaunch.enable();
        } else {
            let _ = autolaunch.disable();
        }
    }

    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::SeqCst)
    }

    pub fn exit_requested(&self) -> bool {
        self.exit_requested.load(Ordering::SeqCst)
    }

    fn reset_exit_request(&self) {
        self.exit_requested.store(false, Ordering::SeqCst);
    }

    pub fn started_from_autostart() -> bool {
        std::env::args_os().any(|argument| argument == "--from-autostart")
    }

    fn ensure_tray(&self, app: &AppHandle) -> bool {
        let mut tray = self.tray_guard();
        if tray.is_some() {
            return true;
        }

        let Some(icon) = app.default_window_icon().cloned() else {
            return false;
        };
        let Ok(open) = MenuItem::with_id(app, "tray-open", "Открыть", true, None::<&str>)
        else {
            return false;
        };
        let Ok(separator_one) = PredefinedMenuItem::separator(app) else {
            return false;
        };
        let Ok(launch) =
            MenuItem::with_id(app, "tray-launch", "Запустить игру", true, None::<&str>)
        else {
            return false;
        };
        let Ok(separator_two) = PredefinedMenuItem::separator(app) else {
            return false;
        };
        let Ok(exit) = MenuItem::with_id(app, "tray-exit", "Выход", true, None::<&str>) else {
            return false;
        };
        let Ok(menu) = Menu::with_items(
            app,
            &[&open, &separator_one, &launch, &separator_two, &exit],
        ) else {
            return false;
        };

        let result = TrayIconBuilder::with_id(TRAY_ID)
            .icon(icon)
            .menu(&menu)
            .tooltip("NATUX WORLD")
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "tray-open" => show_main_window(app),
                "tray-launch" => {
                    show_main_window(app);
                    let _ = app.emit("tray:launch-request", ());
                }
                "tray-exit" => {
                    app.state::<OsIntegration>()
                        .exit_requested
                        .store(true, Ordering::SeqCst);
                    if app
                        .state::<crate::launcher::LauncherService>()
                        .defer_exit_until_pipeline_finishes()
                    {
                        hide_main_window(app);
                    } else {
                        app.exit(0);
                    }
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if matches!(
                    event,
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    }
                ) {
                    show_main_window(tray.app_handle());
                }
            })
            .build(app);

        match result {
            Ok(created) => {
                *tray = Some(created);
                true
            }
            Err(_) => false,
        }
    }

    fn remove_tray(&self, app: &AppHandle) {
        let mut tray = self.tray_guard();
        if let Some(existing) = tray.take() {
            let id = existing.id().clone();
            let _ = app.remove_tray_by_id(&id);
        }
    }

    fn tray_guard(&self) -> MutexGuard<'_, Option<TrayIcon<Wry>>> {
        self.tray
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

pub fn should_hide_startup_window(
    from_autostart: bool,
    launch_on_startup: bool,
    minimize_to_tray: bool,
    tray_ready: bool,
) -> bool {
    from_autostart && launch_on_startup && minimize_to_tray && tray_ready
}

pub fn tray_supported() -> bool {
    !cfg!(target_os = "macos")
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(launcher) = app.try_state::<crate::launcher::LauncherService>() {
        launcher.cancel_deferred_exit();
    }
    if let Some(integration) = app.try_state::<OsIntegration>() {
        integration.reset_exit_request();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::{should_hide_startup_window, tray_supported};

    #[test]
    fn autostart_hides_only_when_settings_and_tray_allow_reopening() {
        assert!(should_hide_startup_window(true, true, true, true));
        assert!(!should_hide_startup_window(false, true, true, true));
        assert!(!should_hide_startup_window(true, false, true, true));
        assert!(!should_hide_startup_window(true, true, false, true));
        assert!(!should_hide_startup_window(true, true, true, false));
    }

    #[test]
    fn tray_is_disabled_on_macos() {
        assert_eq!(tray_supported(), !cfg!(target_os = "macos"));
    }
}
