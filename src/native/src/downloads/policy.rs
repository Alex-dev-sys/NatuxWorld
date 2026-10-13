use std::time::Duration;

pub(super) const MAX_REDIRECTS: usize = 5;
pub(super) const MAX_RETRIES: usize = 3;
pub(super) const MIN_RESUME_BYTES: u64 = 64 * 1024;
pub(super) const MAX_CONCURRENCY: usize = 16;
pub(super) const DEFAULT_CONCURRENCY: usize = 8;
pub(super) const DEFAULT_MAX_FILE_SIZE: u64 = 4 * 1024 * 1024 * 1024;
pub(super) const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
pub(super) const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub(super) const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// Trusted download hosts used by Minecraft metadata and artifact services.
/// Add further hosts only from native Rust code after reviewing redirects.
pub const DEFAULT_ALLOWED_HOSTS: &[&str] = &[
    "launchermeta.mojang.com",
    "piston-meta.mojang.com",
    "piston-data.mojang.com",
    "resources.download.minecraft.net",
    "libraries.minecraft.net",
    "launcher.mojang.com",
    "api.adoptium.net",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "maven.minecraftforge.net",
    "files.minecraftforge.net",
    "meta.fabricmc.net",
    "maven.fabricmc.net",
    "maven.neoforged.net",
];
