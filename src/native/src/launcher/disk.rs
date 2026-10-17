use std::io;
use std::path::Path;
#[cfg(unix)]
use std::process::{Command, Stdio};

const MIN_FREE_BYTES: u64 = 1536 * 1024 * 1024;

pub(super) fn ensure_sufficient_space(minecraft_root: &Path) -> Result<(), String> {
    ensure_sufficient_space_with(minecraft_root, available_space)
}

fn ensure_sufficient_space_with<F>(minecraft_root: &Path, probe: F) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<u64, String>,
{
    let available = probe(minecraft_root)?;
    if available < MIN_FREE_BYTES {
        let available_gb = available as f64 / 1024_f64.powi(3);
        let required_gb = MIN_FREE_BYTES as f64 / 1024_f64.powi(3);
        return Err(format!(
            "Недостаточно места на диске: свободно {available_gb:.1} GB, для игры нужно не менее {required_gb:.1} GB. Освободите место и попробуйте снова."
        ));
    }
    Ok(())
}

fn available_space(path: &Path) -> Result<u64, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "Не удалось определить свободное место на диске".to_owned())?;
    #[cfg(windows)]
    {
        free_bytes_windows(&path).map_err(disk_probe_error)
    }
    #[cfg(unix)]
    {
        free_bytes_unix(&path).map_err(disk_probe_error)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = path;
        Err("Не удалось определить свободное место на диске".to_owned())
    }
}

#[cfg(windows)]
fn free_bytes_windows(path: &Path) -> io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory_name: *const u16,
            free_bytes_available: *mut u64,
            total_bytes: *mut u64,
            total_free_bytes: *mut u64,
        ) -> i32;
    }

    let directory: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0_u64;
    // SAFETY: `directory` is NUL-terminated UTF-16 and `available` remains
    // valid for the duration of the Windows API call.
    let success = unsafe {
        GetDiskFreeSpaceExW(
            directory.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if success == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(available)
    }
}

#[cfg(unix)]
fn free_bytes_unix(path: &Path) -> io::Result<u64> {
    let output = Command::new("df")
        .args(["-Pk"])
        .arg(path)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()?;
    if !output.status.success() || output.stdout.len() > 64 * 1024 {
        return Err(io::Error::other("df disk-space probe failed"));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .rev()
        .find_map(|line| {
            let kib = line.split_whitespace().nth(3)?.parse::<u64>().ok()?;
            kib.checked_mul(1024)
        })
        .ok_or_else(|| io::Error::other("df disk-space output was invalid"))
}

fn disk_probe_error(_: io::Error) -> String {
    "Не удалось определить свободное место на диске".to_owned()
}

#[cfg(test)]
#[path = "disk/tests.rs"]
mod tests;
