use std::ffi::c_void;
use std::ptr;

use super::StartupBackend;

type RegistryKey = *mut c_void;
const CURRENT_USER: RegistryKey = 0x8000_0001_u32 as i32 as isize as RegistryKey;
const QUERY_VALUE: u32 = 0x0001;
const SET_VALUE: u32 = 0x0002;
const NOT_FOUND: i32 = 2;
const STRING_VALUE: u32 = 1;
const MAX_VALUE_BYTES: u32 = 32_768;

#[link(name = "advapi32")]
extern "system" {
    fn RegOpenKeyExW(
        key: RegistryKey,
        subkey: *const u16,
        options: u32,
        access: u32,
        result: *mut RegistryKey,
    ) -> i32;
    fn RegCreateKeyExW(
        key: RegistryKey,
        subkey: *const u16,
        reserved: u32,
        class: *mut u16,
        options: u32,
        access: u32,
        security: *const c_void,
        result: *mut RegistryKey,
        disposition: *mut u32,
    ) -> i32;
    fn RegQueryValueExW(
        key: RegistryKey,
        name: *const u16,
        reserved: *mut u32,
        kind: *mut u32,
        data: *mut u8,
        size: *mut u32,
    ) -> i32;
    fn RegDeleteValueW(key: RegistryKey, name: *const u16) -> i32;
    fn RegSetValueExW(
        key: RegistryKey,
        name: *const u16,
        reserved: u32,
        kind: u32,
        data: *const u8,
        size: u32,
    ) -> i32;
    fn RegCloseKey(key: RegistryKey) -> i32;
}

struct Key(RegistryKey);

impl Key {
    fn open(access: u32) -> Result<Option<Self>, String> {
        Self::open_path(r"Software\Microsoft\Windows\CurrentVersion\Run", access)
    }

    fn open_path(path: &str, access: u32) -> Result<Option<Self>, String> {
        let subkey = wide(path);
        let mut key = ptr::null_mut();
        // SAFETY: NUL-terminated UTF-16 name and initialized output pointer.
        match unsafe { RegOpenKeyExW(CURRENT_USER, subkey.as_ptr(), 0, access, &mut key) } {
            0 => Ok(Some(Self(key))),
            NOT_FOUND => Ok(None),
            _ => Err("could not open launcher startup registrations".to_owned()),
        }
    }

    fn create_run_key() -> Result<Self, String> {
        let path = wide(r"Software\Microsoft\Windows\CurrentVersion\Run");
        let mut key = ptr::null_mut();
        // SAFETY: Fixed per-user key path, initialized outputs, and no optional security descriptor.
        let status = unsafe {
            RegCreateKeyExW(
                CURRENT_USER,
                path.as_ptr(),
                0,
                ptr::null_mut(),
                0,
                QUERY_VALUE | SET_VALUE,
                ptr::null(),
                &mut key,
                ptr::null_mut(),
            )
        };
        if status == 0 {
            Ok(Self(key))
        } else {
            Err("could not create launcher startup registrations".to_owned())
        }
    }

    fn read(&self, name: &str) -> Result<Option<String>, String> {
        let name = wide(name);
        let mut kind = 0;
        let mut size = 0;
        // SAFETY: Valid registry handle, name and writable initialized output values.
        let status = unsafe {
            RegQueryValueExW(
                self.0,
                name.as_ptr(),
                ptr::null_mut(),
                &mut kind,
                ptr::null_mut(),
                &mut size,
            )
        };
        if status == NOT_FOUND {
            return Ok(None);
        }
        if status != 0 {
            return Err("could not read launcher startup registration".to_owned());
        }
        if kind != STRING_VALUE || size == 0 || size > MAX_VALUE_BYTES || size % 2 != 0 {
            return Err("startup registration has an unsupported format".to_owned());
        }
        let mut bytes = vec![0_u16; (size / 2) as usize];
        // SAFETY: Buffer is aligned for UTF-16 and has the byte capacity returned above.
        let status = unsafe {
            RegQueryValueExW(
                self.0,
                name.as_ptr(),
                ptr::null_mut(),
                &mut kind,
                bytes.as_mut_ptr().cast(),
                &mut size,
            )
        };
        if status == NOT_FOUND {
            return Ok(None);
        }
        if status != 0 {
            return Err("startup registration changed while reading".to_owned());
        }
        if kind != STRING_VALUE || size % 2 != 0 {
            return Err("startup registration changed to an unsupported format".to_owned());
        }
        bytes.truncate((size / 2) as usize);
        if bytes.last() == Some(&0) {
            bytes.pop();
        }
        if bytes.contains(&0) {
            return Err("startup registration contains unsupported characters".to_owned());
        }
        String::from_utf16(&bytes)
            .map(Some)
            .map_err(|_| "startup registration is not valid Unicode".to_owned())
    }
}

impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: Owned handle returned by RegOpenKeyExW, closed exactly once.
        unsafe {
            RegCloseKey(self.0);
        }
    }
}

pub(super) struct RegistryBackend;

impl StartupBackend for RegistryBackend {
    fn read(&self, name: &str) -> Result<Option<String>, String> {
        let Some(key) = Key::open(QUERY_VALUE)? else {
            return Ok(None);
        };
        key.read(name)
    }

    fn write(&self, name: &str, command: &str) -> Result<(), String> {
        let key = Key::create_run_key()?;
        let name = wide(name);
        let command = wide(command);
        let bytes = u32::try_from(command.len() * 2).map_err(|_| "startup command is too long")?;
        // SAFETY: Valid key, UTF-16 name, and a NUL-terminated buffer with its exact size.
        let status = unsafe {
            RegSetValueExW(
                key.0,
                name.as_ptr(),
                0,
                STRING_VALUE,
                command.as_ptr().cast(),
                bytes,
            )
        };
        if status != 0 {
            return Err("could not save the launcher startup registration".to_owned());
        }
        // An explicit user enable supersedes an older Windows Startup Apps disable
        // for this exact registration, while unrelated startup overrides remain.
        if let Some(approved) = Key::open_path(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
            SET_VALUE,
        )? {
            // SAFETY: Valid owned key and the same verified registration name.
            let status = unsafe { RegDeleteValueW(approved.0, name.as_ptr()) };
            if !matches!(status, 0 | NOT_FOUND) {
                return Err("could not enable the launcher startup registration".to_owned());
            }
        }
        Ok(())
    }

    fn remove_if_unchanged(&self, name: &str, expected: &str) -> Result<(), String> {
        let Some(key) = Key::open(QUERY_VALUE | SET_VALUE)? else {
            return Ok(());
        };
        if key.read(name)?.as_deref() != Some(expected) {
            return Ok(());
        }
        let name = wide(name);
        // SAFETY: Valid registry handle and NUL-terminated UTF-16 name. The exact
        // value was rechecked before deletion; no unrelated value is enumerated.
        match unsafe { RegDeleteValueW(key.0, name.as_ptr()) } {
            0 | NOT_FOUND => Ok(()),
            _ => Err("could not retire the old launcher startup registration".to_owned()),
        }
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
