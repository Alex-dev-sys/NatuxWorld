use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tokio::sync::Notify;

use crate::account::{AccountResult, AccountService};
use crate::cancellation::CancellationToken;
use crate::downloads::{DownloadJob, DownloadService};
use crate::java::{self, JavaTarget};
use crate::metadata::Platform;
use crate::playtime::PlaytimeService;
use crate::reporting::ReportingService;
use crate::resources::{
    build_asset_index_job, build_asset_jobs, build_client_job, build_library_jobs,
    extract_natives_cancelable, NativeExtractionRequest,
};
use crate::settings::SettingsStore;
use crate::ProfileLockState;

mod arguments;
mod cancel;
mod disk;
mod forge;
mod lifecycle;
mod logs;
mod metadata;
mod process;
mod profile;
mod progress;
mod reporting;
pub(crate) mod retry;
mod types;
use lifecycle::{LaunchContext, RuntimeState};
use logs::LaunchLogTail;
use profile::{check_cancelled, io_message, resolve_profile, sanitize_server};
pub(crate) use progress::LaunchProgress;
pub(crate) use types::{PlayOptions, PlayResult};

const AUTHLIB_URL: &str = "https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.7/authlib-injector-1.2.7.jar";
const AUTHLIB_SHA1: &str = "9a401b2cdb97bf49e5c447dcfb0325979168b672";
const AUTHLIB_SIZE: u64 = 344_477;
const MAX_TOTAL_ASSET_BYTES: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Clone)]
pub(crate) struct LauncherService {
    state: Arc<Mutex<RuntimeState>>,
    pipeline_finished: Arc<Notify>,
}

impl Default for LauncherService {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(RuntimeState::new())),
            pipeline_finished: Arc::new(Notify::new()),
        }
    }
}

impl LauncherService {
    pub(crate) fn get_status(&self) -> LaunchProgress {
        self.state
            .lock()
            .map(|state| state.progress.clone())
            .unwrap_or_else(|_| LaunchProgress::new("error", 0, "Состояние запуска недоступно"))
    }

    pub(crate) fn defer_exit_until_pipeline_finishes(&self) -> bool {
        self.state
            .lock()
            .map(|mut state| state.defer_exit_until_pipeline_finishes())
            .unwrap_or(false)
    }

    pub(crate) fn cancel_deferred_exit(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.cancel_deferred_exit();
        }
    }

    pub(crate) async fn play(
        &self,
        app: AppHandle,
        options: PlayOptions,
        settings: &SettingsStore,
        account: &AccountService,
        playtime: Arc<PlaytimeService>,
        reporting: Arc<ReportingService>,
    ) -> PlayResult {
        let cancellation = match self.begin() {
            Ok(token) => token,
            Err(error) => {
                return PlayResult {
                    ok: false,
                    error: Some(error),
                }
            }
        };
        let mut verified_username = None;
        let logs = LaunchLogTail::default();
        let result = self
            .run_pipeline(
                app.clone(),
                options,
                LaunchContext {
                    settings,
                    account,
                    playtime,
                    reporting: Arc::clone(&reporting),
                    logs: logs.clone(),
                },
                cancellation.clone(),
                &mut verified_username,
            )
            .await;
        match result {
            Ok(()) => PlayResult {
                ok: true,
                error: None,
            },
            Err(error) => {
                let cancelled = cancellation.is_cancelled() || error == "Отменено";
                if !cancelled {
                    reporting::launch_failure(
                        app.clone(),
                        reporting,
                        self.get_status().stage,
                        error.clone(),
                        verified_username,
                        logs.snapshot(),
                    );
                }
                self.finish_pipeline(
                    &app,
                    if cancelled {
                        LaunchProgress::new("idle", 0, "Отменено")
                    } else {
                        LaunchProgress::new("error", 0, &format!("Ошибка: {error}"))
                    },
                );
                PlayResult {
                    ok: false,
                    error: Some(error),
                }
            }
        }
    }

    fn begin(&self) -> Result<CancellationToken, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Состояние запуска недоступно".to_owned())?;
        if state.exit_after_pipeline {
            return Err("Лаунчер завершает работу".to_owned());
        }
        if state.busy {
            return Err("Запуск уже идёт".to_owned());
        }
        state.generation = state.generation.wrapping_add(1);
        let token = CancellationToken::default();
        state.busy = true;
        state.cancellation = Some(token.clone());
        state.progress = LaunchProgress::new("resolving", 0, "Подготовка Minecraft...");
        Ok(token)
    }

    async fn run_pipeline(
        &self,
        app: AppHandle,
        options: PlayOptions,
        context: LaunchContext<'_>,
        cancellation: CancellationToken,
        verified_username: &mut Option<String>,
    ) -> Result<(), String> {
        let (loader, minecraft_version) = resolve_profile(&options)?;
        let server = options.server.as_deref().map(sanitize_server).transpose()?;
        check_cancelled(&cancellation)?;
        let (profile_dir, game_lock) = {
            let profile_locks = app.state::<ProfileLockState>();
            (
                profile_locks.user_data_dir().to_path_buf(),
                profile_locks.acquire_game()?,
            )
        };
        let lock_agent_jar = app
            .path()
            .resolve("natux-lock/natux-lock-agent.jar", BaseDirectory::Resource)
            .map_err(|_| "Не найден обязательный защитный агент запуска Minecraft".to_owned())?;
        arguments::ensure_lock_agent_jar(&lock_agent_jar)?;
        let settings = context.settings.get()?;
        let root = context.settings.minecraft_dir()?;
        fs::create_dir_all(&root).map_err(io_message)?;
        let root = fs::canonicalize(&root).map_err(io_message)?;
        disk::ensure_sufficient_space(&root)?;
        let downloads = DownloadService::new(&root).map_err(|error| error.to_string())?;
        let progress_sink = self.progress_sink(app.clone());

        self.report(
            &app,
            LaunchProgress::new("resolving", 0, "Проверка игровой сессии..."),
        );
        check_cancelled(&cancellation)?;
        let credentials = match context.account.game_session().await {
            AccountResult::Success { data, .. } => data,
            AccountResult::Failure { error, .. } => return Err(error.message),
        };
        check_cancelled(&cancellation)?;
        *verified_username = Some(credentials.username.clone());
        context.logs.set_access_token(&credentials.access_token);

        self.report(
            &app,
            LaunchProgress::new("resolving", 0, "Проверка метаданных Minecraft..."),
        );
        let vanilla = metadata::resolve_version(&root, &minecraft_version, &cancellation).await?;
        check_cancelled(&cancellation)?;
        self.report(
            &app,
            LaunchProgress::new("java-check", 0, "Проверка Java 21..."),
        );
        let target = JavaTarget::current()?;
        let runtime_dir = root.join("runtime");
        let java =
            java::detect_cancelable_blocking(runtime_dir.clone(), target, cancellation.clone())
                .await?;
        let java = match java {
            Some(java) => java,
            None => {
                self.report(
                    &app,
                    LaunchProgress::new(
                        "java-check",
                        5,
                        "Java не найдена, загружаем Temurin 21...",
                    ),
                );
                let release = java::fetch_latest_release_cancelable(target, &cancellation).await?;
                let job = release.download_job();
                let progress =
                    self.download_progress(app.clone(), "java-check", "Загрузка Java 21...");
                downloads
                    .download_many_cancelable(vec![job.clone()], cancellation.clone(), progress)
                    .await
                    .map_err(|error| error.to_string())?;
                check_cancelled(&cancellation)?;
                let archive_path = root.join(job.destination);
                let runtime_dir = runtime_dir.clone();
                let install_cancellation = cancellation.clone();
                tokio::task::spawn_blocking(move || {
                    java::install_release_cancelable(
                        &archive_path,
                        &runtime_dir,
                        &release,
                        &install_cancellation,
                    )
                })
                .await
                .map_err(|_| "Java installation worker failed".to_owned())??
            }
        };

        self.report(
            &app,
            LaunchProgress::new("libraries", 0, "Загрузка Minecraft и библиотек..."),
        );
        let mut library_jobs = build_library_jobs(&vanilla, &Platform::current())?;
        library_jobs.push(build_client_job(&vanilla)?);
        let progress = self.download_progress(app.clone(), "libraries", "Загрузка библиотек...");
        downloads
            .download_many_cancelable(library_jobs, cancellation.clone(), progress)
            .await
            .map_err(|error| error.to_string())?;
        check_cancelled(&cancellation)?;
        self.report(
            &app,
            LaunchProgress::new("assets", 0, "Получение индекса ресурсов..."),
        );
        let asset_index_job = build_asset_index_job(&vanilla)?;
        if asset_index_job.expected_size.unwrap_or(0) > metadata::max_asset_index_bytes() {
            return Err("Minecraft asset index exceeds the size limit".to_owned());
        }
        let asset_index_path = root.join(&asset_index_job.destination);
        let progress =
            self.download_progress(app.clone(), "assets", "Загрузка индекса ресурсов...");
        downloads
            .download_many_cancelable(vec![asset_index_job], cancellation.clone(), progress)
            .await
            .map_err(|error| error.to_string())?;
        check_cancelled(&cancellation)?;
        let asset_index =
            metadata::parse_asset_index_file(&fs::read(&asset_index_path).map_err(io_message)?)?;
        let asset_jobs = build_asset_jobs(&asset_index)?;
        let total_asset_bytes = asset_jobs
            .iter()
            .try_fold(0_u64, |sum, job| {
                sum.checked_add(job.expected_size.unwrap_or(0))
            })
            .ok_or_else(|| "Minecraft asset total size overflow".to_owned())?;
        if total_asset_bytes > MAX_TOTAL_ASSET_BYTES {
            return Err("Minecraft asset download exceeds the total size limit".to_owned());
        }
        let progress = self.download_progress(app.clone(), "assets", "Загрузка ресурсов...");
        downloads
            .download_many_cancelable(asset_jobs, cancellation.clone(), progress)
            .await
            .map_err(|error| error.to_string())?;
        check_cancelled(&cancellation)?;
        self.report(
            &app,
            LaunchProgress::new("natives-extract", 0, "Распаковка нативных библиотек..."),
        );
        let native_request = NativeExtractionRequest::new(
            vanilla.clone(),
            root.clone(),
            root.join(format!("versions/{minecraft_version}/natives")),
            cancellation.clone(),
        );
        tokio::task::spawn_blocking(move || extract_natives_cancelable(native_request))
            .await
            .map_err(|_| "native library extraction worker failed".to_owned())??;
        check_cancelled(&cancellation)?;
        let launch_version = if loader == "forge" {
            self.report(
                &app,
                LaunchProgress::new("forge-install", 0, "Установка Forge..."),
            );
            forge::install(
                &app,
                &minecraft_version,
                Path::new(&java.path),
                &vanilla,
                &root,
                &downloads,
                &cancellation,
                Arc::clone(&progress_sink),
                context.logs.clone(),
            )
            .await?
        } else {
            vanilla.clone()
        };
        check_cancelled(&cancellation)?;
        crate::offline_auth::OfflineAuthService::from_settings(context.settings)?
            .sync_verified_username(&credentials.username)?;

        let authlib_job = DownloadJob {
            url: AUTHLIB_URL.to_owned(),
            destination: PathBuf::from("runtime/authlib-injector.jar"),
            expected_sha1: Some(AUTHLIB_SHA1.to_owned()),
            expected_sha256: None,
            expected_size: Some(AUTHLIB_SIZE),
        };
        self.report(
            &app,
            LaunchProgress::new("spawn", 0, "Проверка authlib-injector..."),
        );
        let progress = self.download_progress(app.clone(), "spawn", "Загрузка authlib-injector...");
        downloads
            .download_many_cancelable(vec![authlib_job], cancellation.clone(), progress)
            .await
            .map_err(|error| error.to_string())?;
        check_cancelled(&cancellation)?;
        let plan = arguments::build_launch_arguments(
            &launch_version,
            &minecraft_version,
            arguments::LaunchPaths {
                root: &root,
                lock_agent_jar: &lock_agent_jar,
            },
            Path::new(&java.path),
            &settings,
            &credentials,
            server.as_deref(),
        )?;
        self.report(&app, LaunchProgress::new("spawn", 0, "Запуск Minecraft..."));
        let (child, process_tree, argfile, output) =
            process::spawn_game(&plan, &cancellation, game_lock, &profile_dir, context.logs)
                .await?;
        let pid = child.id().unwrap_or_default();
        let username = credentials.username.clone();
        let discord = crate::discord::DiscordPresence::start(&username, server.as_deref());
        let access_token = plan.access_token.clone();
        let service = self.clone();
        let monitor_reporting = Arc::clone(&context.reporting);
        let monitor_app = app.clone();
        let monitor_token = cancellation.clone();
        let monitor_playtime = Arc::clone(&context.playtime);
        let delayed_argfile = argfile.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            let _ = fs::remove_file(delayed_argfile);
        });
        let _ = context.playtime.begin_session();
        reporting::launch_succeeded(app.clone(), Arc::clone(&context.reporting));
        self.report(
            &app,
            LaunchProgress::new("running", 100, &format!("Игра запущена (pid {pid})")),
        );
        tokio::spawn(async move {
            let outcome = process::monitor_game(
                child,
                process_tree,
                output,
                monitor_token.clone(),
                monitor_app.clone(),
                access_token,
            )
            .await;
            let _ = fs::remove_file(argfile);
            let _ = monitor_playtime.end_session();
            discord.finish().await;
            let cancelled = monitor_token.is_cancelled();
            let message = if cancelled {
                "Игра остановлена".to_owned()
            } else {
                match &outcome {
                    Ok(outcome) if outcome.status.success() => "Игра завершена".to_owned(),
                    Ok(outcome) => format!("Игра завершилась с кодом {}", outcome.status),
                    Err(error) => format!("Ошибка игрового процесса: {error}"),
                }
            };
            if !cancelled {
                if let Ok(outcome) = outcome {
                    if !outcome.status.success() {
                        reporting::game_crash(
                            monitor_app.clone(),
                            monitor_reporting,
                            username,
                            outcome.status.code(),
                            outcome.recent_logs,
                            message.clone(),
                        );
                    }
                }
            }
            service.finish_pipeline(&monitor_app, LaunchProgress::new("idle", 0, &message));
        });
        if settings.close_on_launch {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "launcher/tests.rs"]
mod tests;
