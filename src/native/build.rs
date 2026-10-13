fn main() {
    println!("cargo:rerun-if-env-changed=NATUX_LOCAL_AUTH_API");
    println!("cargo:rerun-if-env-changed=NATUX_TAURI_UPDATES_ENABLED");
    println!("cargo:rustc-check-cfg=cfg(natux_local_auth_api)");
    if std::env::var("NATUX_LOCAL_AUTH_API").as_deref() == Ok("1") {
        println!("cargo:rustc-cfg=natux_local_auth_api");
    }
    println!("cargo:rerun-if-changed=permissions");
    println!("cargo:rerun-if-changed=permissions/first-stage.toml");

    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "health",
            "get_version",
            "app_ready",
            "window_minimize",
            "window_maximize",
            "window_close",
            "window_is_maximized",
            "settings_get",
            "settings_set",
            "settings_get_system_memory",
            "settings_reset",
            "settings_pick_java",
            "settings_verify_java",
            "account_bootstrap",
            "account_register",
            "account_verify",
            "account_resend",
            "account_login",
            "account_login_2fa",
            "account_two_factor_setup",
            "account_two_factor_enable",
            "account_logout",
            "account_logout_global",
            "auth_login",
            "auth_logout",
            "auth_get_user",
            "launcher_play",
            "launcher_get_status",
            "launcher_cancel",
            "java_detect",
            "java_install",
            "shell_playtime_get",
            "news_get_all",
            "server_get_status",
            "server_get_info",
            "shell_open_external",
            "shell_open_screenshots",
            "shell_diagnostics_run",
            "updater_check",
            "updater_install",
        ]));

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
