use std::io;
use std::path::{Path, PathBuf};

use uuid::Uuid;

const MAX_ARGFILE_BYTES: usize = 1024 * 1024;

pub(super) fn create_argfile(working_dir: &Path, args: &[String]) -> Result<PathBuf, String> {
    remove_stale_argfiles(working_dir);
    let content = to_argfile(args)?;
    if content.len() > MAX_ARGFILE_BYTES {
        return Err("Minecraft launch arguments exceed the size limit".to_owned());
    }
    for _ in 0..3 {
        let path = working_dir.join(format!(".natux-launch-{}.args", Uuid::new_v4()));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(mut file) => {
                use std::io::Write;
                if let Err(error) = file.write_all(content.as_bytes()) {
                    let _ = std::fs::remove_file(&path);
                    return Err(format!(
                        "Minecraft launch arguments could not be written: {error}"
                    ));
                }
                file.sync_all().map_err(|error| {
                    let _ = std::fs::remove_file(&path);
                    format!("Minecraft launch arguments could not be flushed: {error}")
                })?;
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Minecraft launch arguments could not be created: {error}"
                ))
            }
        }
    }
    Err("could not allocate a temporary Minecraft argument file".to_owned())
}

pub(super) fn to_argfile(args: &[String]) -> Result<String, String> {
    let mut output = String::new();
    for (index, arg) in args.iter().enumerate() {
        if arg.contains(['\0', '\r', '\n']) {
            return Err("Minecraft launch argument contains a line break".to_owned());
        }
        if index > 0 {
            output.push('\n');
        }
        output.push('"');
        for ch in arg.chars() {
            if ch == '\\' || ch == '"' {
                output.push('\\');
            }
            output.push(ch);
        }
        output.push('"');
    }
    Ok(output)
}

/// The game lock is held while a launch creates its argument file, so no other
/// game from this profile is running: any argument file still on disk was left
/// by a crashed launcher and still contains that session's access token.
fn remove_stale_argfiles(working_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(working_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
        if is_file && name.starts_with(".natux-launch-") && name.ends_with(".args") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::create_argfile;

    #[test]
    fn a_new_launch_removes_argument_files_left_by_a_crash() {
        let dir = tempfile::tempdir().expect("working directory");
        let stale = dir.path().join(".natux-launch-crashed.args");
        let unrelated = dir.path().join("options.txt");
        std::fs::write(&stale, "--accessToken secret").expect("stale argfile");
        std::fs::write(&unrelated, "keep").expect("unrelated file");

        let fresh = create_argfile(dir.path(), &["-version".to_owned()]).expect("argfile");

        assert!(!stale.exists());
        assert!(unrelated.exists());
        assert!(fresh.exists());
    }
}
