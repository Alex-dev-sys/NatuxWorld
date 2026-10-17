use std::io;
use std::path::{Path, PathBuf};

use uuid::Uuid;

const MAX_ARGFILE_BYTES: usize = 1024 * 1024;

pub(super) fn create_argfile(working_dir: &Path, args: &[String]) -> Result<PathBuf, String> {
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
