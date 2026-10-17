//! Electron uses mainAppService on macOS 13+, and exact bundle URL login items
//! on older macOS. Tauri owns a separate LaunchAgent. Never delete by display name.
//! Sources: electron/electron v43.1.0 shell/browser/browser_mac.mm;
//! chromium/chromium base/mac/mac_util.mm (LoginItemsFileList).

use std::path::{Component, Path, PathBuf};

const LEGACY_BUNDLE_NAME: &str = "NATUX WORLD.app";
const LEGACY_BUNDLE_ID: &str = "world.natux.launcher";

trait LoginItemsBackend {
    fn main_bundle(&self) -> Result<Option<(PathBuf, String)>, String>;
    fn remove_legacy_items_for_bundle(&self, bundle: &Path) -> Result<(), String>;
    fn unregister_current_main_app(&self) -> Result<(), String>;
}

fn verified_bundle_path(executable: &Path) -> Option<PathBuf> {
    // macOS POSIX paths are checked lexically so the safety policy can also be
    // tested on Windows, where Path::is_absolute requires a Windows drive.
    if !executable.to_str()?.starts_with('/')
        || executable.to_str()?.starts_with("//")
        || executable
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return None;
    }
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    if macos.file_name()? != "MacOS"
        || contents.file_name()? != "Contents"
        || bundle.file_name()? != LEGACY_BUNDLE_NAME
        || bundle.ancestors().skip(1).any(|ancestor| {
            ancestor
                .extension()
                .is_some_and(|extension| extension == "app")
        })
    {
        return None;
    }
    Some(bundle.to_owned())
}

fn retire_verified_bundle(
    backend: &impl LoginItemsBackend,
    executable: &Path,
) -> Result<(), String> {
    let Some(expected) = verified_bundle_path(executable) else {
        return Ok(());
    };
    let Some((loaded_bundle, identifier)) = backend.main_bundle()? else {
        return Ok(());
    };
    if loaded_bundle != expected || identifier != LEGACY_BUNDLE_ID {
        return Ok(());
    }
    backend.remove_legacy_items_for_bundle(&expected)?;
    // This API is scoped to the verified running main bundle, not an arbitrary
    // bundle identifier. It cannot unregister a different application's service.
    backend.unregister_current_main_app()
}

#[cfg(target_os = "macos")]
pub(super) fn retire() -> Result<(), String> {
    let executable = std::env::current_exe()
        .and_then(std::fs::canonicalize)
        .map_err(|_| "startup bundle path unavailable")?;
    retire_verified_bundle(&native::Backend, &executable)
}

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use smappservice_rs::{AppService, ServiceManagementError, ServiceStatus, ServiceType};
    use std::ffi::{c_char, c_void, CStr};
    use std::os::unix::ffi::OsStrExt;
    use std::ptr;

    type Ref = *const c_void;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFBundleGetMainBundle() -> Ref;
        fn CFBundleCopyBundleURL(bundle: Ref) -> Ref;
        fn CFBundleGetIdentifier(bundle: Ref) -> Ref;
        fn CFStringGetCString(value: Ref, buffer: *mut c_char, size: isize, encoding: u32) -> u8;
        fn CFURLGetFileSystemRepresentation(
            url: Ref,
            resolve: u8,
            buffer: *mut u8,
            size: isize,
        ) -> u8;
        fn CFArrayGetCount(array: Ref) -> isize;
        fn CFArrayGetValueAtIndex(array: Ref, index: isize) -> Ref;
        fn CFRelease(value: Ref);
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        static kLSSharedFileListSessionLoginItems: Ref;
        fn LSSharedFileListCreate(allocator: Ref, list_type: Ref, options: Ref) -> Ref;
        fn LSSharedFileListCopySnapshot(list: Ref, seed: *mut u32) -> Ref;
        fn LSSharedFileListItemCopyResolvedURL(item: Ref, flags: u32, error: *mut Ref) -> Ref;
        fn LSSharedFileListItemRemove(list: Ref, item: Ref) -> i32;
    }

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Ref;
    }

    // Only Copy/Create results enter Owned; Get results and array elements stay
    // borrowed while their owning bundle/snapshot remains alive.
    struct Owned(Ref);
    impl Owned {
        fn new(value: Ref) -> Option<Self> {
            (!value.is_null()).then_some(Self(value))
        }
    }
    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) };
        }
    }

    unsafe fn url_path(url: Ref) -> Option<PathBuf> {
        if url.is_null() {
            return None;
        }
        let mut bytes = vec![0_u8; 65_536];
        if CFURLGetFileSystemRepresentation(url, 1, bytes.as_mut_ptr(), bytes.len() as isize) == 0 {
            return None;
        }
        let length = bytes.iter().position(|byte| *byte == 0)?;
        Some(PathBuf::from(std::ffi::OsStr::from_bytes(&bytes[..length])))
    }

    unsafe fn resolved_item_path(item: Ref) -> Option<PathBuf> {
        // kLSSharedFileListNoUserInteraction | kLSSharedFileListDoNotMountVolumes:
        // resolving an unrelated login item must not open dialogs or mount disks.
        let url = Owned::new(LSSharedFileListItemCopyResolvedURL(
            item,
            3,
            ptr::null_mut(),
        ))?;
        url_path(url.0)
    }

    pub(super) struct Backend;
    impl LoginItemsBackend for Backend {
        fn main_bundle(&self) -> Result<Option<(PathBuf, String)>, String> {
            // CFBundleGetMainBundle is process-scoped; no untrusted bundle is opened.
            unsafe {
                let bundle = CFBundleGetMainBundle();
                if bundle.is_null() {
                    return Ok(None);
                }
                let Some(url) = Owned::new(CFBundleCopyBundleURL(bundle)) else {
                    return Ok(None);
                };
                let Some(path) = url_path(url.0) else {
                    return Ok(None);
                };
                let identifier = CFBundleGetIdentifier(bundle);
                if identifier.is_null() {
                    return Ok(None);
                }
                let mut buffer = [0_i8; 256];
                if CFStringGetCString(
                    identifier,
                    buffer.as_mut_ptr(),
                    buffer.len() as isize,
                    0x08000100,
                ) == 0
                {
                    return Ok(None);
                }
                let identifier = CStr::from_ptr(buffer.as_ptr())
                    .to_str()
                    .map_err(|_| "startup bundle identifier unavailable")?;
                Ok(Some((path, identifier.to_owned())))
            }
        }

        fn remove_legacy_items_for_bundle(&self, expected: &Path) -> Result<(), String> {
            unsafe {
                let Some(list) = Owned::new(LSSharedFileListCreate(
                    ptr::null(),
                    kLSSharedFileListSessionLoginItems,
                    ptr::null(),
                )) else {
                    // Chromium/Electron also treat an unavailable deprecated
                    // list as absent. Modern main-app cleanup must still run.
                    return Ok(());
                };
                let Some(snapshot) =
                    Owned::new(LSSharedFileListCopySnapshot(list.0, ptr::null_mut()))
                else {
                    return Ok(());
                };
                for index in 0..CFArrayGetCount(snapshot.0) {
                    let item = CFArrayGetValueAtIndex(snapshot.0, index);
                    if item.is_null() || resolved_item_path(item).as_deref() != Some(expected) {
                        continue;
                    }
                    // Re-resolve immediately before mutation; keep stale or changed
                    // entries untouched rather than deleting by a snapshot name.
                    if resolved_item_path(item).as_deref() == Some(expected)
                        && LSSharedFileListItemRemove(list.0, item) != 0
                    {
                        return Err("could not retire the legacy launcher login item".to_owned());
                    }
                }
                Ok(())
            }
        }

        fn unregister_current_main_app(&self) -> Result<(), String> {
            // The class is absent before macOS 13. Do not invoke unavailable APIs.
            if unsafe { objc_getClass(c"SMAppService".as_ptr()) }.is_null() {
                return Ok(());
            }
            let service = AppService::new(ServiceType::MainApp);
            if matches!(
                service.status(),
                ServiceStatus::Enabled | ServiceStatus::RequiresApproval
            ) {
                match service.unregister() {
                    Ok(()) | Err(ServiceManagementError::JobNotFound) => {}
                    Err(error) => {
                        return Err(format!(
                            "could not retire the legacy launcher main-app login item: {error}"
                        ));
                    }
                }
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct FakeBackend {
        bundle: PathBuf,
        identifier: String,
        entries: RefCell<Vec<PathBuf>>,
        modern_removed: RefCell<bool>,
    }
    impl LoginItemsBackend for FakeBackend {
        fn main_bundle(&self) -> Result<Option<(PathBuf, String)>, String> {
            Ok(Some((self.bundle.clone(), self.identifier.clone())))
        }
        fn remove_legacy_items_for_bundle(&self, expected: &Path) -> Result<(), String> {
            self.entries.borrow_mut().retain(|entry| entry != expected);
            Ok(())
        }
        fn unregister_current_main_app(&self) -> Result<(), String> {
            *self.modern_removed.borrow_mut() = true;
            Ok(())
        }
    }

    fn backend() -> FakeBackend {
        FakeBackend {
            bundle: PathBuf::from("/Applications/NATUX WORLD.app"),
            identifier: LEGACY_BUNDLE_ID.to_owned(),
            entries: RefCell::new(vec![
                PathBuf::from("/Applications/NATUX WORLD.app"),
                PathBuf::from("/Other/NATUX WORLD.app"),
                PathBuf::from("/Applications/Unrelated.app"),
            ]),
            modern_removed: RefCell::new(false),
        }
    }

    #[test]
    fn takeover_preserves_other_applications_and_other_installations() {
        let backend = backend();
        retire_verified_bundle(
            &backend,
            Path::new("/Applications/NATUX WORLD.app/Contents/MacOS/launcher"),
        )
        .unwrap();
        assert_eq!(backend.entries.borrow().len(), 2);
        assert!(backend
            .entries
            .borrow()
            .contains(&PathBuf::from("/Other/NATUX WORLD.app")));
        assert!(*backend.modern_removed.borrow());
    }

    #[test]
    fn mismatched_loaded_bundle_or_identifier_never_changes_login_items() {
        for (path, identifier) in [
            ("/Other/NATUX WORLD.app", LEGACY_BUNDLE_ID),
            ("/Applications/NATUX WORLD.app", "other.application"),
        ] {
            let mut backend = backend();
            backend.bundle = PathBuf::from(path);
            backend.identifier = identifier.to_owned();
            retire_verified_bundle(
                &backend,
                Path::new("/Applications/NATUX WORLD.app/Contents/MacOS/launcher"),
            )
            .unwrap();
            assert_eq!(backend.entries.borrow().len(), 3);
            assert!(!*backend.modern_removed.borrow());
        }
    }

    #[test]
    fn only_a_direct_executable_inside_the_known_main_app_is_eligible() {
        for path in [
            "/Applications/Unrelated.app/Contents/MacOS/launcher",
            "/Applications/NATUX WORLD.app/Contents/launcher",
            "/Applications/Other.app/Contents/NATUX WORLD.app/Contents/MacOS/launcher",
            "/Applications/../Applications/NATUX WORLD.app/Contents/MacOS/launcher",
            "NATUX WORLD.app/Contents/MacOS/launcher",
        ] {
            assert!(verified_bundle_path(Path::new(path)).is_none(), "{path}");
        }
    }
}
