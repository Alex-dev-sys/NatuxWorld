use std::collections::VecDeque;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

use super::{
    drain_reader_tasks, installer_failure_message, installer_log, record_installer_line,
    remember_crash_log, spawn_installer_log_reader, to_argfile, LauncherLog,
    MAX_CRASH_REPORT_LINES, MAX_INSTALLER_STDERR_LINES,
};

#[test]
fn argfile_keeps_spaces_and_escapes_java_special_characters() {
    let args = vec![
        "two words".to_owned(),
        r#"C:\Minecraft\game"#.to_owned(),
        "quoted\"value".to_owned(),
    ];
    let rendered = to_argfile(&args).expect("serialized Java argument file");
    assert_eq!(
        rendered,
        r#""two words"
"C:\\Minecraft\\game"
"quoted\"value""#
    );
}

#[test]
fn argfile_rejects_line_break_injection() {
    assert!(to_argfile(&["safe\n--add-opens=unsafe".to_owned()]).is_err());
    assert!(to_argfile(&["safe\0unsafe".to_owned()]).is_err());
}

#[test]
fn crash_report_keeps_only_the_most_recent_bounded_log_tail() {
    let mut logs = VecDeque::new();
    for index in 0..=MAX_CRASH_REPORT_LINES {
        remember_crash_log(
            &mut logs,
            &LauncherLog {
                stream: "stdout".to_owned(),
                line: format!("line {index}"),
            },
        );
    }

    assert_eq!(logs.len(), MAX_CRASH_REPORT_LINES);
    assert_eq!(logs.front().map(String::as_str), Some("[stdout] line 1"));
    assert_eq!(logs.back().map(String::as_str), Some("[stdout] line 300"));
}

#[tokio::test]
async fn forge_installer_stderr_is_forwarded_as_forge_diagnostics() {
    let (mut writer, reader) = tokio::io::duplex(128);
    let (sender, mut receiver) = mpsc::channel(4);
    spawn_installer_log_reader(reader, true, sender);
    writer
        .write_all(b"processor failed\r\n")
        .await
        .expect("write fake installer stderr");
    drop(writer);

    let (log, is_stderr) = receiver.recv().await.expect("receive Forge log");
    assert_eq!(log.stream, "forge");
    assert_eq!(log.line, "processor failed");
    assert!(is_stderr);
    assert!(receiver.recv().await.is_none());
}

#[tokio::test]
async fn game_exit_does_not_wait_forever_for_a_pipe_reader_that_keeps_its_handle_open() {
    let (sender, mut receiver) = mpsc::channel(8);
    sender
        .send(LauncherLog {
            stream: "stdout".to_owned(),
            line: "game stopped".to_owned(),
        })
        .await
        .unwrap();
    let inherited_pipe = sender.clone();
    let reader = tokio::spawn(async move {
        let _keep_pipe_open = inherited_pipe;
        std::future::pending::<()>().await;
    });
    drop(sender);

    let started = Instant::now();
    let lines = drain_reader_tasks(&mut receiver, vec![reader]).await;

    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].line, "game stopped");
}

#[test]
fn forge_failure_keeps_a_bounded_recent_stderr_tail() {
    let mut batch = Vec::new();
    let mut stderr_tail = VecDeque::new();
    for index in 0..=MAX_INSTALLER_STDERR_LINES {
        record_installer_line(
            installer_log(format!("stderr {index}")),
            true,
            &mut batch,
            &mut stderr_tail,
        );
    }

    assert_eq!(stderr_tail.len(), MAX_INSTALLER_STDERR_LINES);
    assert_eq!(stderr_tail.front().map(String::as_str), Some("stderr 1"));
    let error = installer_failure_message(failing_status(), &stderr_tail);
    assert!(error.contains("Forge installer exited with status"));
    assert!(error.contains("stderr 18 | stderr 19 | stderr 20"));
    assert!(!error.contains("stderr 17"));
}

#[cfg(unix)]
#[tokio::test]
async fn process_tree_guard_kills_descendants_after_root_exits() {
    use std::fs;
    use std::process::Stdio;
    use tokio::process::Command;

    use super::process_tree::{configure_process_group, ProcessTreeGuard};

    let directory = tempfile::tempdir().expect("temporary process-test directory");
    let pid_path = directory.path().join("descendant.pid");
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg("sleep 60 & child=$!; printf '%s' \"$child\" > \"$1\"; wait")
        .arg("natux-process-tree-test")
        .arg(&pid_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_process_group(&mut command);

    let mut child = command.spawn().expect("spawn process-group root");
    let mut process_tree = ProcessTreeGuard::attach(&child).expect("attach process group");
    let descendant_pid = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(pid) = fs::read_to_string(&pid_path) {
                if let Ok(pid) = pid.parse::<i32>() {
                    break pid;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("shell should start its descendant");

    child.start_kill().expect("stop process-group root");
    let _ = child.wait().await;
    process_tree.terminate().expect("terminate process group");

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let result = unsafe { libc::kill(descendant_pid, 0) };
            if result == -1 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("descendant should exit after the process group is terminated");
}

#[cfg(windows)]
#[tokio::test]
async fn process_tree_guard_kills_descendants_after_root_exits() {
    use std::fs;
    use std::process::Stdio;
    use tokio::process::Command;
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    use super::process_tree::ProcessTreeGuard;

    fn process_is_running(pid: u32) -> bool {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return false;
        }
        let mut exit_code = 0;
        let running = unsafe { GetExitCodeProcess(handle, &mut exit_code) } != 0
            && exit_code == STILL_ACTIVE as u32;
        unsafe { CloseHandle(handle) };
        running
    }

    let directory = tempfile::tempdir().expect("temporary process-test directory");
    let pid_path = directory.path().join("descendant.pid");
    let executable = std::env::current_exe().expect("current Rust test executable");
    let mut child = Command::new(executable)
        .args([
            "--exact",
            "launcher::process::tests::process_tree_descendant_fixture",
            "--nocapture",
        ])
        .env("NATUX_TEST_PROCESS_TREE_HELPER", "1")
        .env("NATUX_TEST_CHILD_PID_FILE", &pid_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn process-tree root");
    let mut process_tree = ProcessTreeGuard::attach(&child).expect("attach Windows job object");
    let descendant_pid = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if let Ok(pid) = fs::read_to_string(&pid_path) {
                if let Ok(pid) = pid.trim().parse::<u32>() {
                    break pid;
                }
            }
            if let Some(status) = child.try_wait().expect("poll Rust process-tree fixture") {
                panic!("Rust process-tree fixture exited before starting descendant: {status}");
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("Rust process-tree fixture should start its descendant");

    child.start_kill().expect("stop process-tree root only");
    let _ = child.wait().await;
    process_tree
        .terminate()
        .expect("terminate Windows job object");

    tokio::time::timeout(Duration::from_secs(5), async {
        while process_is_running(descendant_pid) {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("descendant should exit after the job is terminated");
}

#[cfg(windows)]
#[test]
fn process_tree_descendant_fixture() {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Stdio;

    if std::env::var_os("NATUX_TEST_PROCESS_TREE_HELPER").is_none() {
        return;
    }

    let pid_path = PathBuf::from(
        std::env::var_os("NATUX_TEST_CHILD_PID_FILE").expect("descendant PID file path"),
    );
    let ping_path = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows system root"))
        .join("System32")
        .join("ping.exe");
    let mut descendant = std::process::Command::new(ping_path)
        .args(["-t", "127.0.0.1"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn ping descendant");
    fs::write(pid_path, descendant.id().to_string()).expect("write descendant PID");

    loop {
        if descendant
            .try_wait()
            .expect("poll ping descendant")
            .is_some()
        {
            panic!("ping descendant exited before process-tree termination");
        }
        std::thread::sleep(Duration::from_secs(60));
    }
}

#[cfg(unix)]
fn failing_status() -> std::process::ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1 << 8)
}

#[cfg(windows)]
fn failing_status() -> std::process::ExitStatus {
    use std::os::windows::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1)
}
