use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use natux_profile_lock_core::{probe_game, try_acquire, try_acquire_game, try_acquire_profile};

struct RustHolder {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl RustHolder {
    fn release(mut self) {
        writeln!(self.stdin, "release").unwrap();
        self.stdin.flush().unwrap();
        let mut rest = String::new();
        let _ = self.stdout.read_to_string(&mut rest);
        let status = self.child.wait().unwrap();
        assert!(status.success(), "holder test child failed: {rest}");
    }

    fn kill(mut self) {
        self.child.kill().unwrap();
        let _ = self.child.wait().unwrap();
    }
}

fn spawn_rust_holder(path: &Path) -> RustHolder {
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "child_lock_worker", "--nocapture"])
        .env("NATUX_PROFILE_LOCK_CHILD_PATH", path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut stdout = BufReader::new(stdout);
    let ready = read_marker(&mut stdout, &["LOCKED", "BUSY"]);
    assert_eq!(ready, "LOCKED", "child could not acquire {path:?}");
    RustHolder {
        child,
        stdin,
        stdout,
    }
}

fn read_marker(reader: &mut impl BufRead, markers: &[&str]) -> String {
    loop {
        let mut line = String::new();
        let count = reader.read_line(&mut line).unwrap();
        assert_ne!(count, 0, "child exited before sending a lock marker");
        let marker = line.trim();
        if markers.contains(&marker) {
            return marker.to_owned();
        }
    }
}

#[test]
fn child_lock_worker() {
    let Ok(path) = std::env::var("NATUX_PROFILE_LOCK_CHILD_PATH") else {
        return;
    };
    let Some(_guard) = try_acquire(Path::new(&path)).unwrap() else {
        println!("BUSY");
        std::io::stdout().flush().unwrap();
        return;
    };
    println!("LOCKED");
    std::io::stdout().flush().unwrap();
    let mut input = String::new();
    let _ = std::io::stdin().read_line(&mut input);
}

#[test]
fn independent_process_cannot_acquire_held_lock_then_can_after_release() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join(".profile.lock");
    let holder = spawn_rust_holder(&path);

    assert!(try_acquire(&path).unwrap().is_none());
    holder.release();
    assert!(try_acquire(&path).unwrap().is_some());
}

#[test]
fn process_termination_releases_kernel_lock() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join(".profile.lock");
    let holder = spawn_rust_holder(&path);

    assert!(try_acquire(&path).unwrap().is_none());
    holder.kill();
    assert!(try_acquire(&path).unwrap().is_some());
}

#[test]
fn launcher_probe_reports_game_lock_held_by_another_process() {
    let temp = tempfile::tempdir().unwrap();
    let game_path = temp.path().join(".game.lock");
    let holder = spawn_rust_holder(&game_path);

    assert!(probe_game(temp.path()).unwrap());
    holder.release();
    assert!(!probe_game(temp.path()).unwrap());
}

#[test]
fn released_guard_reacquires_after_competing_process_exits() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join(".profile.lock");
    let mut launcher_guard = try_acquire(&path).unwrap().expect("profile lock is free");
    launcher_guard.release().unwrap();

    let holder = spawn_rust_holder(&path);
    assert!(!launcher_guard.try_reacquire().unwrap());
    holder.release();
    assert!(launcher_guard.try_reacquire().unwrap());
}

#[test]
fn helper_holds_profile_lock_until_stdin_closes() {
    let temp = tempfile::tempdir().unwrap();
    let mut helper = spawn_helper("profile", temp.path());
    assert!(try_acquire_profile(temp.path()).unwrap().is_none());

    let status = helper.close_stdin_and_wait();
    assert!(status.success());
    assert!(try_acquire_profile(temp.path()).unwrap().is_some());
}

#[test]
fn helper_busy_marker_is_fail_closed() {
    let temp = tempfile::tempdir().unwrap();
    let _guard = try_acquire_game(temp.path())
        .unwrap()
        .expect("game lock is free");
    let helper = spawn_helper("game", temp.path());

    assert_eq!(helper.marker, "NATUX_LOCK_BUSY_V1");
    assert!(!helper.child.wait_with_output().unwrap().status.success());
}

#[test]
fn helper_ready_marker_follows_game_lock_acquisition() {
    let temp = tempfile::tempdir().unwrap();
    let mut helper = spawn_helper("game", temp.path());
    assert_eq!(helper.marker, "NATUX_LOCK_READY_V1");
    assert!(probe_game(temp.path()).unwrap());

    assert!(helper.close_stdin_and_wait().success());
    assert!(!probe_game(temp.path()).unwrap());
}

struct RunningHelper {
    child: Child,
    stdin: Option<ChildStdin>,
    marker: String,
}

impl RunningHelper {
    fn close_stdin_and_wait(&mut self) -> std::process::ExitStatus {
        drop(self.stdin.take());
        self.child.wait().unwrap()
    }
}

fn spawn_helper(kind: &str, user_data: &Path) -> RunningHelper {
    let mut child = Command::new(env!("CARGO_BIN_EXE_lock-helper"))
        .args(["--kind", kind, "--user-data"])
        .arg(user_data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let marker = read_marker(&mut stdout, &["NATUX_LOCK_READY_V1", "NATUX_LOCK_BUSY_V1"]);
    // Keep draining stdout through EOF for busy processes so their pipe cannot fill.
    if marker == "NATUX_LOCK_BUSY_V1" {
        let mut rest = String::new();
        let _ = stdout.read_to_string(&mut rest);
    }
    RunningHelper {
        child,
        stdin: Some(stdin),
        marker,
    }
}

#[cfg(unix)]
#[test]
fn symlink_lock_path_is_rejected() {
    use natux_profile_lock_core::LockError;
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let target = temp.path().join("real.lock");
    std::fs::write(&target, []).unwrap();
    let link = temp.path().join(".profile.lock");
    symlink(&target, &link).unwrap();

    assert!(matches!(
        try_acquire(&link),
        Err(LockError::InvalidLockFile(_)) | Err(LockError::Open { .. })
    ));
}

#[test]
fn java_file_channel_uses_the_same_exclusive_byte_range_when_jdk_is_configured() {
    let Some(java_home) = java_home() else {
        eprintln!("skipping Java interop: set NATUX_PROFILE_LOCK_JAVA_HOME to a JDK");
        return;
    };
    let java = java_executable(&java_home, "java");
    let javac = java_executable(&java_home, "javac");
    if !java.is_file() || !javac.is_file() {
        eprintln!("skipping Java interop: JDK tools are missing under {java_home:?}");
        return;
    }

    let temp = tempfile::tempdir().unwrap();
    let class_dir = temp.path().join("classes");
    std::fs::create_dir(&class_dir).unwrap();
    let source =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/JavaFileLockProbe.java");
    let compile = Command::new(javac)
        .args(["--release", "8", "-d"])
        .arg(&class_dir)
        .arg(&source)
        .output()
        .unwrap();
    assert!(
        compile.status.success(),
        "javac failed: {}",
        String::from_utf8_lossy(&compile.stderr)
    );

    let path = temp.path().join(".profile.lock");
    let rust_guard = try_acquire(&path).unwrap().expect("profile lock is free");
    let java_probe = Command::new(&java)
        .arg("-cp")
        .arg(&class_dir)
        .arg("JavaFileLockProbe")
        .arg("probe")
        .arg(&path)
        .output()
        .unwrap();
    assert_eq!(java_probe.status.code(), Some(3));
    assert_eq!(String::from_utf8_lossy(&java_probe.stdout).trim(), "BUSY");
    let adjacent_probe = Command::new(&java)
        .arg("-cp")
        .arg(&class_dir)
        .arg("JavaFileLockProbe")
        .arg("probe-adjacent")
        .arg(&path)
        .output()
        .unwrap();
    assert!(adjacent_probe.status.success());
    assert_eq!(
        String::from_utf8_lossy(&adjacent_probe.stdout).trim(),
        "ACQUIRED"
    );
    drop(rust_guard);

    let mut java_holder = Command::new(&java)
        .arg("-cp")
        .arg(&class_dir)
        .arg("JavaFileLockProbe")
        .arg("hold")
        .arg(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut java_stdout = BufReader::new(java_holder.stdout.take().unwrap());
    assert_eq!(read_marker(&mut java_stdout, &["LOCKED", "BUSY"]), "LOCKED");
    assert!(try_acquire(&path).unwrap().is_none());
    writeln!(java_holder.stdin.as_mut().unwrap(), "release").unwrap();
    java_holder.stdin.as_mut().unwrap().flush().unwrap();
    assert!(java_holder.wait().unwrap().success());
    assert!(try_acquire(&path).unwrap().is_some());
}

fn java_home() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("NATUX_PROFILE_LOCK_JAVA_HOME") {
        return Some(PathBuf::from(path));
    }
    std::env::var_os("JAVA_HOME").map(PathBuf::from)
}

fn java_executable(java_home: &Path, name: &str) -> PathBuf {
    if cfg!(windows) {
        java_home.join("bin").join(format!("{name}.exe"))
    } else {
        java_home.join("bin").join(name)
    }
}
