use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

use uuid::Uuid;

const MAX_BACKUP_NAME_ATTEMPTS: usize = 8;

/// Copies a malformed persisted file beside itself without replacing an existing backup.
pub(crate) fn backup_corrupt_file(file: &Path) -> io::Result<PathBuf> {
    let metadata = fs::symlink_metadata(file)?;
    if !metadata.file_type().is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "corrupt data path is not a regular file",
        ));
    }

    let parent = file
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = file.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "corrupt data path has no filename",
        )
    })?;
    let mut input = File::open(file)?;

    for _ in 0..MAX_BACKUP_NAME_ATTEMPTS {
        let mut backup_name = file_name.to_os_string();
        backup_name.push(format!(".corrupt-{}.bak", Uuid::new_v4()));
        let backup_path = parent.join(backup_name);
        let mut output = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        };

        let copy_result = io::copy(&mut input, &mut output).and_then(|_| output.sync_all());
        if let Err(error) = copy_result {
            drop(output);
            let _ = fs::remove_file(&backup_path);
            return Err(error);
        }
        return Ok(backup_path);
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a unique corrupt-data backup name",
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::tempdir;

    use super::backup_corrupt_file;

    #[test]
    fn backup_copies_bytes_to_a_new_sibling_and_keeps_the_original() {
        let temp = tempdir().expect("temporary directory");
        let file = temp.path().join("settings.json");
        let corrupt = b"{unreadable settings bytes";
        fs::write(&file, corrupt).expect("corrupt file");

        let backup = backup_corrupt_file(&file).expect("backup");

        assert_eq!(backup.parent(), Some(temp.path()));
        assert!(backup
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("settings.json.corrupt-"));
        assert_eq!(fs::read(backup).expect("backup bytes"), corrupt);
        assert_eq!(fs::read(file).expect("original bytes"), corrupt);
    }

    #[cfg(unix)]
    #[test]
    fn backup_refuses_to_follow_a_symlinked_source() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().expect("temporary directory");
        let target = temp.path().join("outside.json");
        let link = temp.path().join("settings.json");
        fs::write(&target, b"outside data").expect("target file");
        symlink(&target, &link).expect("source symlink");

        assert!(backup_corrupt_file(&link).is_err());
        assert_eq!(fs::read(&target).expect("target bytes"), b"outside data");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 2);
    }
}
