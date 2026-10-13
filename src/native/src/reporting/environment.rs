pub(super) fn legacy_platform_label(os: &str) -> &str {
    match os {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

pub(super) fn legacy_arch_label(arch: &str) -> &str {
    match arch {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "ia32",
        other => other,
    }
}
