use std::io;

#[cfg(windows)]
pub(super) async fn connect() -> io::Result<tokio::net::windows::named_pipe::NamedPipeClient> {
    for index in 0..10 {
        let path = format!(r"\\?\pipe\discord-ipc-{index}");
        if let Ok(pipe) = tokio::net::windows::named_pipe::ClientOptions::new().open(path) {
            return Ok(pipe);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "Discord IPC is unavailable",
    ))
}

#[cfg(unix)]
pub(super) async fn connect() -> io::Result<tokio::net::UnixStream> {
    for path in socket_paths() {
        if let Ok(Ok(stream)) = tokio::time::timeout(
            std::time::Duration::from_millis(200),
            tokio::net::UnixStream::connect(path),
        )
        .await
        {
            return Ok(stream);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "Discord IPC is unavailable",
    ))
}

#[cfg(unix)]
fn socket_paths() -> Vec<std::path::PathBuf> {
    let mut directories = Vec::new();
    for variable in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"] {
        if let Some(value) = std::env::var_os(variable).filter(|value| !value.is_empty()) {
            let path = std::path::PathBuf::from(value);
            if path.is_absolute() && !directories.contains(&path) {
                directories.push(path);
            }
        }
    }
    let fallback = std::path::PathBuf::from("/tmp");
    if !directories.contains(&fallback) {
        directories.push(fallback);
    }
    directories
        .into_iter()
        .flat_map(|directory| {
            (0..10).map(move |index| directory.join(format!("discord-ipc-{index}")))
        })
        .collect()
}
