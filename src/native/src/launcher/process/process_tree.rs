use std::io;
use std::process::Stdio;

use tokio::process::{Child, Command};

#[cfg(unix)]
pub(crate) struct ProcessTreeGuard {
    process_group: i32,
    terminated: bool,
}

#[cfg(windows)]
pub(crate) struct ProcessTreeGuard {
    job: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(not(any(unix, windows)))]
pub(crate) struct ProcessTreeGuard;

#[cfg(unix)]
impl ProcessTreeGuard {
    pub(super) fn attach(child: &Child) -> io::Result<Self> {
        let pid = child
            .id()
            .ok_or_else(|| io::Error::other("child process id is unavailable"))?;
        let process_group = i32::try_from(pid)
            .map_err(|_| io::Error::other("child process id is outside the supported range"))?;
        Ok(Self {
            process_group,
            terminated: false,
        })
    }

    pub(super) fn terminate(&mut self) -> io::Result<()> {
        let result = unsafe { libc::kill(-self.process_group, libc::SIGKILL) };
        if result == 0 {
            self.terminated = true;
            return Ok(());
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            self.terminated = true;
            Ok(())
        } else {
            Err(error)
        }
    }
}

#[cfg(unix)]
impl Drop for ProcessTreeGuard {
    fn drop(&mut self) {
        if !self.terminated {
            let _ = self.terminate();
        }
    }
}

#[cfg(windows)]
impl ProcessTreeGuard {
    pub(super) fn attach(child: &Child) -> io::Result<Self> {
        use std::ptr::null;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let process = child
            .raw_handle()
            .ok_or_else(|| io::Error::other("child process handle is unavailable"))?;
        let job = unsafe { CreateJobObjectW(null(), null()) };
        if job.is_null() {
            return Err(io::Error::last_os_error());
        }
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&limits) as u32,
            )
        };
        if configured == 0 {
            let error = io::Error::last_os_error();
            unsafe { CloseHandle(job) };
            return Err(error);
        }
        let assigned = unsafe { AssignProcessToJobObject(job, process) };
        if assigned == 0 {
            let error = io::Error::last_os_error();
            unsafe { CloseHandle(job) };
            return Err(error);
        }
        Ok(Self { job })
    }

    pub(super) fn terminate(&mut self) -> io::Result<()> {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;

        if unsafe { TerminateJobObject(self.job, 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

#[cfg(windows)]
// SAFETY: A Windows kernel job handle may be used and closed from any thread.
unsafe impl Send for ProcessTreeGuard {}

#[cfg(windows)]
impl Drop for ProcessTreeGuard {
    fn drop(&mut self) {
        // KILL_ON_JOB_CLOSE also covers cancellation or unwinding in the monitor.
        unsafe { windows_sys::Win32::Foundation::CloseHandle(self.job) };
    }
}

#[cfg(not(any(unix, windows)))]
impl ProcessTreeGuard {
    pub(super) fn attach(_: &Child) -> io::Result<Self> {
        Ok(Self)
    }

    pub(super) fn terminate(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(super) fn configure_process_group(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.as_std_mut().process_group(0);
    }
    #[cfg(not(unix))]
    let _ = command;
}

pub(super) async fn terminate_unmanaged_process_tree(child: &mut Child) {
    if let Some(pid) = child.id() {
        #[cfg(unix)]
        if let Ok(process_group) = i32::try_from(pid) {
            unsafe { libc::kill(-process_group, libc::SIGKILL) };
        }

        #[cfg(windows)]
        {
            let pid = pid.to_string();
            let _ = Command::new("taskkill")
                .args(["/PID", &pid, "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}
