use std::fs;
use std::path::{Path, PathBuf};

use crate::error::LockError;

pub(crate) fn prepare_identity(path: &Path) -> Result<PathBuf, LockError> {
    let Some(file_name) = path.file_name() else {
        return Err(LockError::InvalidPath(path.to_path_buf()));
    };
    if file_name.is_empty() || file_name == "." || file_name == ".." {
        return Err(LockError::InvalidPath(path.to_path_buf()));
    }

    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&parent).map_err(|source| LockError::ParentDirectory {
        path: parent.clone(),
        source,
    })?;
    let canonical_parent =
        fs::canonicalize(&parent).map_err(|source| LockError::ParentDirectory {
            path: parent.clone(),
            source,
        })?;

    Ok(canonical_parent.join(file_name))
}
