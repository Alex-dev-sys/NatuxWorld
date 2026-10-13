use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::cancellation::CancellationToken;

use super::{archive, JavaInstallation, JavaOs, JavaTarget, TemurinRelease, JAVA_MAJOR_VERSION};

const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_PROBE_OUTPUT: usize = 4096;

pub fn managed_java_path(runtime_dir: &Path, target: JavaTarget) -> PathBuf {
    executable_in_root(&runtime_dir.join("jre-21"), target)
}

fn executable_in_root(root: &Path, target: JavaTarget) -> PathBuf {
    root.join(java_executable_relative_path(target))
}

pub fn system_java_command(target: JavaTarget) -> &'static str {
    match target.os {
        JavaOs::Windows => "java.exe",
        JavaOs::Mac | JavaOs::Linux => "java",
    }
}

/// Detects a usable managed runtime first, then Java from PATH.
pub fn detect(runtime_dir: &Path, target: JavaTarget) -> Option<JavaInstallation> {
    let managed = managed_java_path(runtime_dir, target);
    if let Ok(version) = probe_java(&managed) {
        return Some(installation(version, "Temurin", managed));
    }
    let system = PathBuf::from(system_java_command(target));
    probe_java(&system)
        .ok()
        .map(|version| installation(version, "system", system))
}

pub(crate) fn detect_cancelable(
    runtime_dir: &Path,
    target: JavaTarget,
    cancellation: &CancellationToken,
) -> Result<Option<JavaInstallation>, String> {
    let managed = managed_java_path(runtime_dir, target);
    match probe_java_with_cancellation(&managed, Some(cancellation)) {
        Ok(version) => {
            if cancellation.is_cancelled() {
                return Err("Отменено".to_owned());
            }
            return Ok(Some(installation(version, "Temurin", managed)));
        }
        Err(error) if error == "Отменено" => return Err(error),
        Err(_) => {}
    }
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }

    let system = PathBuf::from(system_java_command(target));
    match probe_java_with_cancellation(&system, Some(cancellation)) {
        Ok(version) if !cancellation.is_cancelled() => {
            Ok(Some(installation(version, "system", system)))
        }
        Ok(_) => Err("Отменено".to_owned()),
        Err(error) if error == "Отменено" => Err(error),
        Err(_) if cancellation.is_cancelled() => Err("Отменено".to_owned()),
        Err(_) => Ok(None),
    }
}

pub fn install_release(
    archive_path: &Path,
    runtime_dir: &Path,
    release: &TemurinRelease,
) -> Result<JavaInstallation, String> {
    install_release_cancelable(
        archive_path,
        runtime_dir,
        release,
        &CancellationToken::default(),
    )
}

pub(crate) fn install_release_cancelable(
    archive_path: &Path,
    runtime_dir: &Path,
    release: &TemurinRelease,
    cancellation: &CancellationToken,
) -> Result<JavaInstallation, String> {
    if archive_path.file_name().and_then(|name| name.to_str())
        != Some(release.package_name.as_str())
    {
        return Err(
            "downloaded Java archive does not match the selected Temurin package".to_owned(),
        );
    }
    archive::install_archive_cancelable(
        archive_path,
        runtime_dir,
        release.archive,
        java_executable_relative_path(release.target),
        cancellation,
        |root| {
            probe_java_with_cancellation(
                &executable_in_root(root, release.target),
                Some(cancellation),
            )
            .map(|_| ())
        },
    )?;
    if cancellation.is_cancelled() {
        return Err("Отменено".to_owned());
    }
    let path = managed_java_path(runtime_dir, release.target);
    let version = probe_java_with_cancellation(&path, Some(cancellation))?;
    Ok(installation(version, "Temurin", path))
}

pub const fn java_executable_relative_path(target: JavaTarget) -> &'static str {
    match target.os {
        JavaOs::Windows => "bin/javaw.exe",
        JavaOs::Mac => "Contents/Home/bin/java",
        JavaOs::Linux => "bin/java",
    }
}

fn installation(version: String, vendor: &str, path: PathBuf) -> JavaInstallation {
    JavaInstallation {
        version,
        vendor: vendor.to_owned(),
        path: path.to_string_lossy().into_owned(),
    }
}

pub fn parse_java_version(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let start = line.find("version \"")? + "version \"".len();
        let value = line.get(start..)?.split_once('"')?.0;
        (!value.is_empty()).then(|| value.to_owned())
    })
}

pub fn is_java_21_plus(output: &str) -> bool {
    let Some(version) = parse_java_version(output) else {
        return false;
    };
    let major = version
        .strip_prefix("1.")
        .and_then(|rest| rest.split(['.', '-', '+']).next())
        .or_else(|| version.split(['.', '-', '+']).next())
        .and_then(|value| value.parse::<u32>().ok());
    major.is_some_and(|major| major >= u32::from(JAVA_MAJOR_VERSION))
}

/// Runs a fixed Java probe directly (without a shell), with a deadline and bounded output.
pub fn probe_java(java_path: &Path) -> Result<String, String> {
    probe_java_with_cancellation(java_path, None)
}

fn probe_java_with_cancellation(
    java_path: &Path,
    cancellation: Option<&CancellationToken>,
) -> Result<String, String> {
    if cancellation.is_some_and(CancellationToken::is_cancelled) {
        return Err("Отменено".to_owned());
    }
    let probe_path = if cfg!(target_os = "windows")
        && java_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("javaw.exe"))
    {
        java_path.with_file_name("java.exe")
    } else {
        java_path.to_path_buf()
    };
    let mut child = Command::new(probe_path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| {
            format!(
                "Java executable could not be started: {}",
                java_path.display()
            )
        })?;
    let stdout_reader = spawn_reader(child.stdout.take().expect("piped Java stdout"));
    let stderr_reader = spawn_reader(child.stderr.take().expect("piped Java stderr"));
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let status = loop {
        if cancellation.is_some_and(CancellationToken::is_cancelled) {
            stop_probe(&mut child, stdout_reader, stderr_reader);
            return Err("Отменено".to_owned());
        }
        if Instant::now() >= deadline {
            stop_probe(&mut child, stdout_reader, stderr_reader);
            return Err("Java version probe timed out".to_owned());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                stop_probe(&mut child, stdout_reader, stderr_reader);
                return Err("Java version probe failed".to_owned());
            }
        }
    };
    let mut output = stdout_reader.join().unwrap_or_default();
    output.extend(stderr_reader.join().unwrap_or_default());
    if cancellation.is_some_and(CancellationToken::is_cancelled) {
        return Err("Отменено".to_owned());
    }
    let output = String::from_utf8_lossy(&output);
    if !status.success() || !is_java_21_plus(&output) {
        return Err("Java 21 or newer was not detected".to_owned());
    }
    parse_java_version(&output).ok_or_else(|| "Java version output is invalid".to_owned())
}

fn stop_probe(
    child: &mut Child,
    stdout_reader: thread::JoinHandle<Vec<u8>>,
    stderr_reader: thread::JoinHandle<Vec<u8>>,
) {
    let _ = child.kill();
    let _ = child.wait();
    let _ = stdout_reader.join();
    let _ = stderr_reader.join();
}

fn spawn_reader<R: Read + Send + 'static>(mut reader: R) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut captured = Vec::with_capacity(MAX_PROBE_OUTPUT);
        let mut buffer = [0; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let remaining = MAX_PROBE_OUTPUT.saturating_sub(captured.len());
                    captured.extend_from_slice(&buffer[..count.min(remaining)]);
                }
            }
        }
        captured
    })
}
