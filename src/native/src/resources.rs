//! Pure resource planning and safe extraction for Minecraft libraries/assets.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};

#[cfg(test)]
use crate::cancellation::CancellationToken;
use crate::downloads::DownloadJob;
use crate::metadata::{
    evaluate_rules, AssetIndex, DownloadEntry, Library, OsName, Platform, VersionMetadata,
};

pub const ASSET_BASE_URL: &str = "https://resources.download.minecraft.net";

#[path = "resources/extraction.rs"]
mod extraction;

#[cfg(test)]
use extraction::{
    extract_archive, extract_archive_with_limits, extract_natives_with_observer,
    NATIVE_COPY_BUFFER_BYTES,
};
pub(crate) use extraction::{extract_natives_cancelable, NativeExtractionRequest};

/// Plan artifacts for the selected platform. Destinations are always relative
/// to the downloader's Minecraft root, never absolute or renderer-controlled.
pub fn build_library_jobs(
    version: &VersionMetadata,
    platform: &Platform,
) -> Result<Vec<DownloadJob>, String> {
    let mut jobs = BTreeMap::<PathBuf, DownloadJob>::new();
    let selected_native_names = select_native_libraries(&version.libraries, platform)
        .into_iter()
        .map(|library| library.name.as_str())
        .collect::<BTreeSet<_>>();
    for library in &version.libraries {
        if !evaluate_rules(library.rules.as_deref(), platform, &BTreeMap::new()) {
            continue;
        }
        if is_named_native_for_os(library, platform.os)
            && !selected_native_names.contains(library.name.as_str())
        {
            continue;
        }
        if let Some(artifact) = library
            .downloads
            .as_ref()
            .and_then(|downloads| downloads.artifact.as_ref())
        {
            if !artifact.url.is_empty() {
                insert_job(&mut jobs, library_job(artifact)?)?;
            }
        }
        if let Some(classifier) = native_classifier(library, platform) {
            if let Some(entry) = library
                .downloads
                .as_ref()
                .and_then(|downloads| downloads.classifiers.get(&classifier))
            {
                if !entry.url.is_empty() {
                    insert_job(&mut jobs, library_job(entry)?)?;
                }
            }
        }
    }
    Ok(jobs.into_values().collect())
}

pub fn build_client_job(version: &VersionMetadata) -> Result<DownloadJob, String> {
    let entry = version
        .downloads
        .as_ref()
        .and_then(|downloads| downloads.client.as_ref())
        .ok_or_else(|| format!("version {} does not provide a client jar", version.id))?;
    let path = format!("versions/{0}/{0}.jar", version.id);
    job_from_entry(entry, PathBuf::from(path))
}

pub fn build_asset_index_job(version: &VersionMetadata) -> Result<DownloadJob, String> {
    let index = version
        .asset_index
        .as_ref()
        .ok_or_else(|| format!("version {} does not provide an asset index", version.id))?;
    validate_sha1(&index.sha1, "asset index")?;
    validate_https_url(&index.url)?;
    let destination = PathBuf::from(format!("assets/indexes/{}.json", index.id));
    validate_relative_path(&destination)?;
    Ok(DownloadJob {
        url: index.url.clone(),
        destination,
        expected_sha1: Some(index.sha1.to_ascii_lowercase()),
        expected_sha256: None,
        expected_size: Some(index.size),
    })
}

pub fn build_asset_jobs(index: &AssetIndex) -> Result<Vec<DownloadJob>, String> {
    let mut sizes_by_hash = BTreeMap::<String, u64>::new();
    for object in index.objects.values() {
        validate_sha1(&object.hash, "asset object")?;
        let hash = object.hash.to_ascii_lowercase();
        if let Some(previous) = sizes_by_hash.insert(hash.clone(), object.size) {
            if previous != object.size {
                return Err(format!("asset hash {hash} has conflicting sizes"));
            }
        }
    }

    Ok(sizes_by_hash
        .into_iter()
        .map(|(hash, size)| {
            let prefix = &hash[..2];
            DownloadJob {
                url: format!("{ASSET_BASE_URL}/{prefix}/{hash}"),
                destination: PathBuf::from(format!("assets/objects/{prefix}/{hash}")),
                expected_sha1: Some(hash),
                expected_sha256: None,
                expected_size: Some(size),
            }
        })
        .collect())
}

/// Select only the native archives that can be loaded by the target OS/CPU.
/// Base classifiers are retained on ARM only when no explicit ARM twin exists,
/// matching the launcher's existing macOS behavior for libraries such as freetype.
pub fn select_native_libraries<'a>(
    libraries: &'a [Library],
    platform: &Platform,
) -> Vec<&'a Library> {
    let candidates = libraries
        .iter()
        .filter(|library| evaluate_rules(library.rules.as_deref(), platform, &BTreeMap::new()))
        .filter(|library| has_native_for_os(library, platform.os))
        .collect::<Vec<_>>();

    candidates
        .iter()
        .copied()
        .filter(|library| native_arch_matches(library, &candidates, platform))
        .collect()
}

/// Extract selected native JAR entries into a flat native directory. Archive
/// traversal and symlink entries are rejected; class and META-INF files are skipped.
#[cfg(test)]
pub fn extract_natives(
    version: &VersionMetadata,
    minecraft_root: &Path,
    native_dir: &Path,
    platform: &Platform,
) -> Result<(), String> {
    extraction::extract_natives_with_observer(
        version,
        minecraft_root,
        native_dir,
        platform,
        &CancellationToken::default(),
        |_| {},
    )
}

fn native_archive_path(library: &Library, platform: &Platform) -> Option<PathBuf> {
    if is_named_native_for_os(library, platform.os) {
        return library
            .downloads
            .as_ref()?
            .artifact
            .as_ref()?
            .path
            .as_deref()
            .map(PathBuf::from)
            .map(|path| PathBuf::from("libraries").join(path));
    }
    let classifier = native_classifier(library, platform)?;
    let entry = library.downloads.as_ref()?.classifiers.get(&classifier)?;
    entry
        .path
        .as_deref()
        .map(PathBuf::from)
        .map(|path| PathBuf::from("libraries").join(path))
}

fn library_job(entry: &DownloadEntry) -> Result<DownloadJob, String> {
    let path = entry
        .path
        .as_deref()
        .ok_or_else(|| "download entry has no relative path".to_owned())?;
    validate_relative_path(Path::new(path))?;
    let destination = PathBuf::from("libraries").join(path);
    job_from_entry(entry, destination)
}

fn job_from_entry(entry: &DownloadEntry, destination: PathBuf) -> Result<DownloadJob, String> {
    validate_relative_path(&destination)?;
    validate_https_url(&entry.url)?;
    validate_sha1(&entry.sha1, "download entry")?;
    Ok(DownloadJob {
        url: entry.url.clone(),
        destination,
        expected_sha1: Some(entry.sha1.to_ascii_lowercase()),
        expected_sha256: None,
        expected_size: Some(entry.size),
    })
}

fn insert_job(jobs: &mut BTreeMap<PathBuf, DownloadJob>, job: DownloadJob) -> Result<(), String> {
    if let Some(existing) = jobs.get(&job.destination) {
        if existing != &job {
            return Err(format!(
                "conflicting metadata downloads target {}",
                job.destination.display()
            ));
        }
        return Ok(());
    }
    jobs.insert(job.destination.clone(), job);
    Ok(())
}

fn has_native_for_os(library: &Library, os: OsName) -> bool {
    library.natives.contains_key(os.as_str()) || is_named_native_for_os(library, os)
}

fn is_named_native_for_os(library: &Library, os: OsName) -> bool {
    let Some(classifier) = library.name.split(':').nth(3) else {
        return false;
    };
    classifier.starts_with("natives-") && classifier_matches_os(classifier, os)
}

fn classifier_matches_os(classifier: &str, os: OsName) -> bool {
    let aliases: &[&str] = match os {
        OsName::Windows => &["windows", "win"],
        OsName::Osx => &["macos", "osx", "mac"],
        OsName::Linux => &["linux"],
    };
    aliases.iter().any(|alias| {
        classifier == format!("natives-{alias}")
            || classifier.starts_with(&format!("natives-{alias}-"))
    })
}

fn native_arch_matches(library: &Library, candidates: &[&Library], platform: &Platform) -> bool {
    let Some(classifier) = library.name.split(':').nth(3) else {
        // A manifest with natives{} but no explicit name classifier points to a
        // separate downloads.classifiers entry selected below.
        return native_classifier(library, platform).is_some();
    };
    if !classifier.starts_with("natives-") {
        return native_classifier(library, platform).is_some();
    }

    match explicit_classifier_arch(classifier) {
        Some(ClassifierArch::Arm64) => is_arm64(&platform.arch),
        Some(ClassifierArch::X86_64) => is_x86_64(&platform.arch),
        Some(ClassifierArch::X86) => is_x86(&platform.arch),
        None if is_arm64(&platform.arch) => {
            let arm_twin = format!("{}-arm64", library.name);
            !candidates
                .iter()
                .any(|candidate| candidate.name == arm_twin)
        }
        None => true,
    }
}

#[derive(Clone, Copy)]
enum ClassifierArch {
    Arm64,
    X86_64,
    X86,
}

fn explicit_classifier_arch(classifier: &str) -> Option<ClassifierArch> {
    let lower = classifier.to_ascii_lowercase();
    if lower.ends_with("-arm64") || lower.ends_with("-aarch64") || lower.ends_with("-aarch_64") {
        Some(ClassifierArch::Arm64)
    } else if lower.ends_with("-x86_64") || lower.ends_with("-x64") || lower.ends_with("-amd64") {
        Some(ClassifierArch::X86_64)
    } else if lower.ends_with("-x86") || lower.ends_with("-i386") || lower.ends_with("-i686") {
        Some(ClassifierArch::X86)
    } else {
        None
    }
}

fn native_classifier(library: &Library, platform: &Platform) -> Option<String> {
    let template = library.natives.get(platform.os.as_str())?;
    let classifiers = &library.downloads.as_ref()?.classifiers;
    if classifiers.contains_key(template) {
        return Some(template.clone());
    }
    let arch_variants: &[&str] = if is_arm64(&platform.arch) {
        &["arm64", "aarch64", "aarch_64"]
    } else if is_x86_64(&platform.arch) {
        &["64", "x86_64", "x64", "amd64"]
    } else if is_x86(&platform.arch) {
        &["32", "x86", "i386"]
    } else {
        &[]
    };
    arch_variants.iter().find_map(|arch| {
        let candidate = template.replace("${arch}", arch);
        classifiers.contains_key(&candidate).then_some(candidate)
    })
}

fn is_arm64(arch: &str) -> bool {
    matches!(
        arch.to_ascii_lowercase().as_str(),
        "arm64" | "aarch64" | "aarch_64"
    )
}

fn is_x86_64(arch: &str) -> bool {
    matches!(
        arch.to_ascii_lowercase().as_str(),
        "x86_64" | "x64" | "amd64"
    )
}

fn is_x86(arch: &str) -> bool {
    matches!(
        arch.to_ascii_lowercase().as_str(),
        "x86" | "i386" | "i486" | "i586" | "i686"
    )
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    let raw = path.to_string_lossy().replace('\\', "/");
    if raw.is_empty() || raw.len() > 4096 {
        return Err("metadata path must be a non-empty relative path".to_owned());
    }
    if raw.chars().any(|ch| matches!(ch, ':' | '\0')) {
        return Err("metadata path contains a forbidden character".to_owned());
    }
    for component in Path::new(&raw).components() {
        let Component::Normal(name) = component else {
            return Err("metadata path must not contain traversal or roots".to_owned());
        };
        let name = name.to_string_lossy();
        if name.is_empty()
            || name.len() > 255
            || name.ends_with('.')
            || name.ends_with(' ')
            || is_windows_device_name(&name)
        {
            return Err("metadata path contains an invalid component".to_owned());
        }
    }
    Ok(())
}

fn is_windows_device_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

fn validate_https_url(raw: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "download URL is invalid".to_owned())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("download URL must be a safe HTTPS URL".to_owned());
    }
    Ok(())
}

fn validate_sha1(hash: &str, kind: &str) -> Result<(), String> {
    if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!("{kind} SHA-1 must be 40 hexadecimal characters"));
    }
    Ok(())
}

#[cfg(test)]
#[path = "resources/tests.rs"]
mod tests;
