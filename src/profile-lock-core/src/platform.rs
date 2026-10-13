use std::fs::{File, OpenOptions};
use std::io;
use std::path::Path;

#[cfg(unix)]
pub(crate) fn open_lock_file(path: &Path) -> io::Result<File> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};

    let mut options = OpenOptions::new();
    options
        .create(true)
        .read(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "lock path must be a single-link regular file, not a symlink",
        ));
    }
    Ok(file)
}

#[cfg(windows)]
pub(crate) fn open_lock_file(path: &Path) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT,
    };

    let mut options = OpenOptions::new();
    options
        .create(true)
        .read(true)
        .write(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, &mut information) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if !metadata.is_file()
        || information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || information.nNumberOfLinks != 1
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "lock path must be a single-link regular file, not a reparse point",
        ));
    }
    Ok(file)
}

#[cfg(unix)]
pub(crate) fn try_lock(file: &File) -> io::Result<bool> {
    use std::os::fd::AsRawFd;

    let mut lock: libc::flock = unsafe { std::mem::zeroed() };
    lock.l_type = libc::F_WRLCK as _;
    lock.l_whence = libc::SEEK_SET as _;
    lock.l_start = 0;
    lock.l_len = 1;
    lock.l_pid = 0;

    let result = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &lock) };
    if result == 0 {
        return Ok(true);
    }
    let error = io::Error::last_os_error();
    if matches!(error.raw_os_error(), Some(libc::EACCES | libc::EAGAIN)) {
        Ok(false)
    } else {
        Err(error)
    }
}

#[cfg(unix)]
pub(crate) fn unlock(file: &File) -> io::Result<()> {
    use std::os::fd::AsRawFd;

    let mut lock: libc::flock = unsafe { std::mem::zeroed() };
    lock.l_type = libc::F_UNLCK as _;
    lock.l_whence = libc::SEEK_SET as _;
    lock.l_start = 0;
    lock.l_len = 1;
    lock.l_pid = 0;
    let result = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_SETLK, &lock) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(windows)]
pub(crate) fn try_lock(file: &File) -> io::Result<bool> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_LOCK_VIOLATION};
    use windows_sys::Win32::Storage::FileSystem::{
        LockFileEx, LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY,
    };
    use windows_sys::Win32::System::IO::OVERLAPPED;

    let mut overlapped = OVERLAPPED::default();
    let success = unsafe {
        LockFileEx(
            file.as_raw_handle() as _,
            LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
            0,
            1,
            0,
            &mut overlapped,
        )
    };
    if success != 0 {
        return Ok(true);
    }
    let error = unsafe { GetLastError() };
    if error == ERROR_LOCK_VIOLATION {
        Ok(false)
    } else {
        Err(io::Error::from_raw_os_error(error as i32))
    }
}

#[cfg(windows)]
pub(crate) fn unlock(file: &File) -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::UnlockFileEx;
    use windows_sys::Win32::System::IO::OVERLAPPED;

    let mut overlapped = OVERLAPPED::default();
    let success = unsafe { UnlockFileEx(file.as_raw_handle() as _, 0, 1, 0, &mut overlapped) };
    if success != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}
