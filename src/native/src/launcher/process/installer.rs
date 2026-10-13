use std::collections::VecDeque;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::cancellation::CancellationToken;

use super::process_tree::{
    configure_process_group, terminate_unmanaged_process_tree, ProcessTreeGuard,
};
use super::{
    emit_logs, process_error, LauncherLog, LOG_QUEUE_CAPACITY, MAX_INSTALLER_STDERR_LINES,
    MAX_LOG_BATCH, MAX_LOG_LINE_BYTES,
};

pub(crate) async fn run_installer(
    app: &tauri::AppHandle,
    java_path: &Path,
    working_dir: &Path,
    installer_path: &Path,
    cancellation: &CancellationToken,
) -> Result<(), String> {
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }
    let mut command = Command::new(java_path);
    command
        .arg("-jar")
        .arg(installer_path)
        .arg("--installClient")
        .arg(working_dir)
        .current_dir(working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    configure_process_group(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Forge installer could not be started: {error}"))?;
    let mut process_tree = match ProcessTreeGuard::attach(&child) {
        Ok(process_tree) => process_tree,
        Err(error) => {
            terminate_unmanaged_process_tree(&mut child).await;
            return Err(format!(
                "Forge installer process tree could not be supervised: {error}"
            ));
        }
    };
    let (sender, mut receiver) = mpsc::channel(LOG_QUEUE_CAPACITY);
    if let Some(stdout) = child.stdout.take() {
        spawn_installer_log_reader(stdout, false, sender.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_installer_log_reader(stderr, true, sender.clone());
    }
    drop(sender);
    let mut interval = tokio::time::interval(Duration::from_millis(100));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut batch = Vec::new();
    let mut stderr_tail = VecDeque::with_capacity(MAX_INSTALLER_STDERR_LINES);
    let mut cleanup_error = None;
    let status = loop {
        if cancellation.is_cancelled() {
            if let Err(error) = process_tree.terminate() {
                cleanup_error = Some(error);
                let _ = child.kill().await;
            }
            let _ = child.wait().await;
            break None;
        }
        if let Some(status) = child.try_wait().map_err(process_error)? {
            if let Err(error) = process_tree.terminate() {
                cleanup_error = Some(error);
            }
            break Some(status);
        }
        tokio::select! {
            _ = cancellation.cancelled() => {
                if let Err(error) = process_tree.terminate() {
                    cleanup_error = Some(error);
                    let _ = child.kill().await;
                }
                let _ = child.wait().await;
                break None;
            }
            Some((line, is_stderr)) = receiver.recv() => {
                record_installer_line(line, is_stderr, &mut batch, &mut stderr_tail);
                if batch.len() >= MAX_LOG_BATCH {
                    emit_logs(app, std::mem::take(&mut batch));
                }
            }
            _ = interval.tick() => {
                if !batch.is_empty() {
                    emit_logs(app, std::mem::take(&mut batch));
                }
            }
        }
    };
    drop(process_tree);
    while let Some((line, is_stderr)) = receiver.recv().await {
        record_installer_line(line, is_stderr, &mut batch, &mut stderr_tail);
        if batch.len() >= MAX_LOG_BATCH {
            emit_logs(app, std::mem::take(&mut batch));
        }
    }
    if !batch.is_empty() {
        emit_logs(app, batch);
    }
    if let Some(error) = cleanup_error {
        return Err(format!(
            "Forge installer process tree cleanup failed: {error}"
        ));
    }
    let Some(status) = status else {
        return Err("Отменено".to_owned());
    };
    if status.success() {
        Ok(())
    } else {
        Err(installer_failure_message(status, &stderr_tail))
    }
}

pub(super) fn spawn_installer_log_reader<R>(
    mut input: R,
    is_stderr: bool,
    sender: mpsc::Sender<(LauncherLog, bool)>,
) where
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
                            .to_owned();
                        if sender.send((installer_log(text), is_stderr)).await.is_err() {
                            return;
                        }
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
                .to_owned();
            let _ = sender.send((installer_log(text), is_stderr)).await;
        }
    });
}

pub(super) fn installer_log(line: String) -> LauncherLog {
    LauncherLog {
        stream: "forge".to_owned(),
        line,
    }
}

pub(super) fn record_installer_line(
    line: LauncherLog,
    is_stderr: bool,
    batch: &mut Vec<LauncherLog>,
    stderr_tail: &mut VecDeque<String>,
) {
    if is_stderr {
        if stderr_tail.len() == MAX_INSTALLER_STDERR_LINES {
            stderr_tail.pop_front();
        }
        stderr_tail.push_back(line.line.clone());
    }
    batch.push(line);
}

pub(super) fn installer_failure_message(
    status: std::process::ExitStatus,
    stderr_tail: &VecDeque<String>,
) -> String {
    let details = stderr_tail
        .iter()
        .rev()
        .take(3)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(String::as_str)
        .collect::<Vec<_>>();
    if details.is_empty() {
        format!("Forge installer exited with status {status}")
    } else {
        format!(
            "Forge installer exited with status {status}: {}",
            details.join(" | ")
        )
    }
}
