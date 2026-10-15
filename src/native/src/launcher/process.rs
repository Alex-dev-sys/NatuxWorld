use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use natux_profile_lock_core::GameLock;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;

use crate::cancellation::CancellationToken;

#[path = "process/argfile.rs"]
mod argfile;
#[path = "process/java_environment.rs"]
mod java_environment;
#[path = "process/process_tree.rs"]
mod process_tree;
use self::argfile::create_argfile;
#[cfg(test)]
use self::argfile::to_argfile;
use self::java_environment::configure_game_process_environment;
use self::process_tree::{
    configure_process_group, terminate_unmanaged_process_tree, ProcessTreeGuard,
};
use super::arguments::LaunchArguments;
use super::logs::LaunchLogTail;

pub(super) const MAX_LOG_LINE_BYTES: usize = 8192;
const MAX_LOG_BATCH: usize = 100;
const LOG_QUEUE_CAPACITY: usize = 512;
const MAX_CRASH_REPORT_LINES: usize = 300;
const MAX_INSTALLER_STDERR_LINES: usize = 20;
const POST_EXIT_LOG_DRAIN: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LauncherLog {
    pub(crate) stream: String,
    pub(crate) line: String,
}

pub(crate) struct GameProcessOutcome {
    pub(crate) status: std::process::ExitStatus,
    pub(crate) recent_logs: Vec<String>,
}

pub(crate) struct GameOutputPipes {
    stdout: BufReader<ChildStdout>,
    sender: mpsc::Sender<LauncherLog>,
    receiver: mpsc::Receiver<LauncherLog>,
    stderr_reader: JoinHandle<()>,
    pre_ready_logs: Vec<LauncherLog>,
    launch_logs: LaunchLogTail,
}

mod installer;
mod lock_ready;
pub(crate) use installer::run_installer;
#[cfg(test)]
use installer::{
    installer_failure_message, installer_log, record_installer_line, spawn_installer_log_reader,
};
use lock_ready::{wait_for_lock_ready, LOCK_READY_TIMEOUT};

pub(crate) async fn spawn_game(
    plan: &LaunchArguments,
    cancellation: &CancellationToken,
    mut game_lock: GameLock,
    profile_dir: &Path,
    launch_logs: LaunchLogTail,
) -> Result<(Child, ProcessTreeGuard, PathBuf, GameOutputPipes), String> {
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }
    if profile_dir.to_str().is_none() {
        return Err("Путь к профилю не поддерживается защитным агентом Java".to_owned());
    }
    let argfile = create_argfile(&plan.working_dir, &plan.args)?;
    let mut command = Command::new(&plan.java_path);
    command
        .arg(format!("@{}", argfile.display()))
        .current_dir(&plan.working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    configure_game_process_environment(&mut command, profile_dir);
    configure_process_group(&mut command);
    // All Minecraft/runtime work, including argument-file creation, is complete.
    // The premain agent must acquire this same lock before Minecraft main runs.
    if game_lock.release_for_handoff().is_err() {
        let _ = std::fs::remove_file(argfile);
        return Err("Не удалось передать защиту файлов Minecraft Java-процессу".to_owned());
    }
    let child = command.spawn();
    match child {
        Ok(mut child) => match ProcessTreeGuard::attach(&child) {
            Ok(mut process_tree) => {
                let Some(stdout) = child.stdout.take() else {
                    let _ = process_tree.terminate();
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    let _ = std::fs::remove_file(argfile);
                    return Err("Не удалось проверить защиту игрового процесса".to_owned());
                };
                let Some(stderr) = child.stderr.take() else {
                    let _ = process_tree.terminate();
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    let _ = std::fs::remove_file(argfile);
                    return Err("Не удалось проверить защиту игрового процесса".to_owned());
                };
                let stdout = BufReader::new(stdout);
                let (sender, receiver) = mpsc::channel(LOG_QUEUE_CAPACITY);
                let mut stderr_reader = spawn_log_reader(
                    stderr,
                    "stderr",
                    plan.access_token.clone(),
                    sender.clone(),
                    launch_logs.clone(),
                );
                let ready = tokio::select! {
                    _ = cancellation.cancelled() => Err("Отменено".to_owned()),
                    result = tokio::time::timeout(
                        LOCK_READY_TIMEOUT,
                        wait_for_lock_ready(stdout, plan.access_token.clone(), &launch_logs),
                    ) => match result {
                        Ok(result) => result,
                        Err(_) => Err("Java не подтвердила защиту файлов игры за отведённое время".to_owned()),
                    }
                };
                match ready {
                    Ok((stdout, pre_ready_logs)) => Ok((
                        child,
                        process_tree,
                        argfile,
                        GameOutputPipes {
                            stdout,
                            sender,
                            receiver,
                            stderr_reader,
                            pre_ready_logs,
                            launch_logs,
                        },
                    )),
                    Err(error) => {
                        let _ = process_tree.terminate();
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                        if tokio::time::timeout(POST_EXIT_LOG_DRAIN, &mut stderr_reader)
                            .await
                            .is_err()
                        {
                            stderr_reader.abort();
                            let _ = stderr_reader.await;
                        }
                        drop(sender);
                        let _ = std::fs::remove_file(argfile);
                        Err(error)
                    }
                }
            }
            Err(error) => {
                terminate_unmanaged_process_tree(&mut child).await;
                let _ = std::fs::remove_file(argfile);
                Err(format!(
                    "Minecraft process tree could not be supervised: {error}"
                ))
            }
        },
        Err(error) => {
            let _ = std::fs::remove_file(argfile);
            Err(format!("Minecraft could not be started: {error}"))
        }
    }
}

pub(crate) async fn monitor_game(
    mut child: Child,
    mut process_tree: ProcessTreeGuard,
    output: GameOutputPipes,
    cancellation: CancellationToken,
    app: AppHandle,
    access_token: String,
) -> Result<GameProcessOutcome, String> {
    let mut receiver = output.receiver;
    let sender = output.sender;
    let stdout_reader = spawn_log_reader(
        output.stdout,
        "stdout",
        access_token,
        sender.clone(),
        output.launch_logs,
    );
    drop(sender);
    let readers = vec![stdout_reader, output.stderr_reader];

    let mut interval = tokio::time::interval(Duration::from_millis(125));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut batch = output.pre_ready_logs;
    let mut recent_logs = VecDeque::with_capacity(MAX_CRASH_REPORT_LINES);
    let mut cleanup_error = None;
    for line in &batch {
        remember_crash_log(&mut recent_logs, line);
    }
    let status = loop {
        if let Some(status) = child.try_wait().map_err(process_error)? {
            if let Err(error) = process_tree.terminate() {
                cleanup_error = Some(error);
            }
            break status;
        }
        tokio::select! {
            _ = cancellation.cancelled() => {
                if let Err(error) = process_tree.terminate() {
                    cleanup_error = Some(error);
                    let _ = child.kill().await;
                }
                break child.wait().await.map_err(process_error)?;
            }
            Some(line) = receiver.recv() => {
                remember_crash_log(&mut recent_logs, &line);
                batch.push(line);
                if batch.len() >= MAX_LOG_BATCH {
                    emit_logs(&app, std::mem::take(&mut batch));
                }
            }
            _ = interval.tick() => {
                if !batch.is_empty() {
                    emit_logs(&app, std::mem::take(&mut batch));
                }
            }
        }
    };
    drop(process_tree);
    // A helper process can inherit Java's stdout/stderr handles and keep the
    // pipes open after the game exits. Drain briefly, then abort readers so
    // launcher state can return to idle instead of waiting forever for EOF.
    for line in drain_reader_tasks(&mut receiver, readers).await {
        remember_crash_log(&mut recent_logs, &line);
        batch.push(line);
        if batch.len() >= MAX_LOG_BATCH {
            emit_logs(&app, std::mem::take(&mut batch));
        }
    }
    if !batch.is_empty() {
        emit_logs(&app, batch);
    }
    if let Some(error) = cleanup_error {
        return Err(format!("game process tree cleanup failed: {error}"));
    }
    Ok(GameProcessOutcome {
        status,
        recent_logs: recent_logs.into(),
    })
}

async fn drain_reader_tasks(
    receiver: &mut mpsc::Receiver<LauncherLog>,
    readers: Vec<JoinHandle<()>>,
) -> Vec<LauncherLog> {
    let mut lines = Vec::new();
    let drain = async {
        while let Some(line) = receiver.recv().await {
            lines.push(line);
        }
    };

    match tokio::time::timeout(POST_EXIT_LOG_DRAIN, drain).await {
        Ok(()) => {
            for reader in readers {
                let _ = reader.await;
            }
            lines
        }
        Err(_) => {
            for reader in &readers {
                reader.abort();
            }
            for reader in readers {
                let _ = reader.await;
            }
            while let Ok(line) = receiver.try_recv() {
                lines.push(line);
            }
            lines
        }
    }
}

fn remember_crash_log(logs: &mut VecDeque<String>, line: &LauncherLog) {
    if logs.len() == MAX_CRASH_REPORT_LINES {
        logs.pop_front();
    }
    logs.push_back(format!("[{}] {}", line.stream, line.line));
}

fn spawn_log_reader<R>(
    mut input: R,
    stream: &'static str,
    access_token: String,
    sender: mpsc::Sender<LauncherLog>,
    launch_logs: LaunchLogTail,
) -> JoinHandle<()>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut buffer = [0_u8; 4096];
        let mut line = Vec::with_capacity(1024);
        let mut dropping = false;
        loop {
            let count = match input.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(count) => count,
            };
            for byte in &buffer[..count] {
                if *byte == b'\n' {
                    if !line.is_empty() {
                        let text = String::from_utf8_lossy(&line)
                            .trim_end_matches('\r')
                            .replace(&access_token, "[redacted]");
                        let log = launch_logs.record(LauncherLog {
                            stream: stream.to_owned(),
                            line: text,
                        });
                        let _ = sender.try_send(log);
                    }
                    line.clear();
                    dropping = false;
                } else if !dropping {
                    if line.len() < MAX_LOG_LINE_BYTES {
                        line.push(*byte);
                    } else {
                        dropping = true;
                    }
                }
            }
        }
        if !line.is_empty() {
            let text = String::from_utf8_lossy(&line)
                .trim_end_matches('\r')
                .replace(&access_token, "[redacted]");
            let log = launch_logs.record(LauncherLog {
                stream: stream.to_owned(),
                line: text,
            });
            let _ = sender.try_send(log);
        }
    })
}

fn emit_logs(app: &AppHandle, batch: Vec<LauncherLog>) {
    let _ = app.emit("launcher:log", batch);
}

fn process_error(error: io::Error) -> String {
    format!("game process operation failed: {error}")
}

#[cfg(test)]
#[path = "process/tests.rs"]
mod tests;
