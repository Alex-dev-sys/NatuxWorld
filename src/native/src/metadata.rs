//! Typed, side-effect-free parsing for Mojang version metadata.
//!
//! Fetching, caching, and hash verification of the metadata bytes belong to the
//! launcher orchestration. This module validates their shape and resolves the
//! inheritance/rule semantics needed to prepare downloads and game arguments.

use std::collections::BTreeMap;

use serde::Deserialize;

mod rules;
pub use rules::{evaluate_rules, resolve_game_arguments, resolve_jvm_arguments};

pub const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct VersionManifest {
    #[serde(default)]
    pub versions: Vec<ManifestVersion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ManifestVersion {
    pub id: String,
    pub url: String,
    pub sha1: String,
    #[serde(rename = "type")]
    pub version_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionMetadata {
    pub id: String,
    #[serde(default)]
    pub inherits_from: Option<String>,
    #[serde(default, rename = "type")]
    pub version_type: Option<String>,
    #[serde(default)]
    pub main_class: Option<String>,
    #[serde(default)]
    pub asset_index: Option<AssetIndexReference>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub downloads: Option<VersionDownloads>,
    #[serde(default)]
    pub arguments: Option<VersionArguments>,
    #[serde(default)]
    pub minecraft_arguments: Option<String>,
    #[serde(default)]
    pub java_version: Option<JavaVersion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexReference {
    pub id: String,
    pub url: String,
    pub sha1: String,
    pub size: u64,
    #[serde(default)]
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDownloads {
    #[serde(default)]
    pub client: Option<DownloadEntry>,
    #[serde(default)]
    pub client_mappings: Option<DownloadEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEntry {
    #[serde(default)]
    pub path: Option<String>,
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    #[serde(default)]
    pub natives: BTreeMap<String, String>,
    #[serde(default)]
    pub rules: Option<Vec<Rule>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<DownloadEntry>,
    #[serde(default)]
    pub classifiers: BTreeMap<String, DownloadEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Rule {
    pub action: RuleAction,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: BTreeMap<String, bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleAction {
    Allow,
    Disallow,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    pub major_version: u32,
    #[serde(default)]
    pub component: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct VersionArguments {
    #[serde(default)]
    pub game: Vec<ArgumentEntry>,
    #[serde(default)]
    pub jvm: Vec<ArgumentEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum ArgumentEntry {
    Literal(String),
    Conditional(ConditionalArgument),
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ConditionalArgument {
    #[serde(default)]
    pub rules: Vec<Rule>,
    pub value: OneOrMany<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany<T> {
    One(T),
    Many(Vec<T>),
}

impl<T> OneOrMany<T> {
    fn as_slice(&self) -> &[T] {
        match self {
            Self::One(value) => std::slice::from_ref(value),
            Self::Many(values) => values,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AssetIndex {
    #[serde(default)]
    pub objects: BTreeMap<String, AssetObject>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsName {
    Windows,
    Osx,
    Linux,
}

impl OsName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Osx => "osx",
            Self::Linux => "linux",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Platform {
    pub os: OsName,
    /// Rust target architecture normalized to the names used by launcher metadata.
    pub arch: String,
}

impl Platform {
    pub fn current() -> Self {
        let os = match std::env::consts::OS {
            "windows" => OsName::Windows,
            "macos" => OsName::Osx,
            _ => OsName::Linux,
        };
        let arch = match std::env::consts::ARCH {
            "x86_64" => "x86_64",
            "x86" => "x86",
            "aarch64" => "aarch64",
            other => other,
        }
        .to_owned();
        Self { os, arch }
    }
}

pub fn parse_version_manifest(raw: &str) -> Result<VersionManifest, String> {
    let manifest: VersionManifest =
        serde_json::from_str(raw).map_err(|error| format!("invalid version manifest: {error}"))?;
    if manifest.versions.is_empty() {
        return Err("version manifest contains no versions".to_owned());
    }
    let mut seen = std::collections::BTreeSet::new();
    for entry in &manifest.versions {
        validate_version_id(&entry.id)?;
        if !seen.insert(entry.id.as_str()) {
            return Err(format!("version manifest repeats id {}", entry.id));
        }
        validate_sha1(&entry.sha1, "version manifest entry")?;
        validate_https_url(&entry.url)?;
    }
    Ok(manifest)
}

pub fn parse_version_metadata(raw: &str) -> Result<VersionMetadata, String> {
    let version: VersionMetadata =
        serde_json::from_str(raw).map_err(|error| format!("invalid version metadata: {error}"))?;
    validate_version_id(&version.id)?;
    if version.main_class.as_deref().is_some_and(str::is_empty) {
        return Err("version mainClass must not be empty".to_owned());
    }
    if let Some(parent) = &version.inherits_from {
        validate_version_id(parent)?;
    }
    for library in &version.libraries {
        if library.name.trim().is_empty() {
            return Err("library name must not be empty".to_owned());
        }
    }
    if let Some(reference) = &version.asset_index {
        validate_asset_index_reference(reference)?;
    }
    Ok(version)
}

pub fn parse_asset_index(raw: &str) -> Result<AssetIndex, String> {
    let index: AssetIndex =
        serde_json::from_str(raw).map_err(|error| format!("invalid asset index: {error}"))?;
    for (name, object) in &index.objects {
        if name.is_empty() || name.contains('\0') {
            return Err("asset index contains an invalid object name".to_owned());
        }
        validate_sha1(&object.hash, "asset object")?;
    }
    validate_asset_sizes(&index)?;
    Ok(index)
}

pub fn find_version<'a>(manifest: &'a VersionManifest, id: &str) -> Option<&'a ManifestVersion> {
    manifest.versions.iter().find(|version| version.id == id)
}

/// Applies an inherited profile (e.g. Forge) on top of its named vanilla version.
/// Libraries are keyed by group/artifact/classifier, with child definitions winning.
/// Argument order is parent first and child second, matching the Electron launcher.
pub fn merge_inherited(
    parent: &VersionMetadata,
    mut child: VersionMetadata,
) -> Result<VersionMetadata, String> {
    if child.inherits_from.as_deref() != Some(parent.id.as_str()) {
        return Err(format!(
            "version {} does not inherit from {}",
            child.id, parent.id
        ));
    }

    child.version_type = child.version_type.or_else(|| parent.version_type.clone());
    child.main_class = child.main_class.or_else(|| parent.main_class.clone());
    child.asset_index = child.asset_index.or_else(|| parent.asset_index.clone());
    child.assets = child.assets.or_else(|| parent.assets.clone());
    child.java_version = child.java_version.or_else(|| parent.java_version.clone());
    child.downloads = merge_downloads(parent.downloads.as_ref(), child.downloads.take());
    child.arguments = merge_arguments(parent.arguments.as_ref(), child.arguments.take());
    child.minecraft_arguments = child
        .minecraft_arguments
        .or_else(|| parent.minecraft_arguments.clone());
    child.libraries = merge_libraries(&parent.libraries, &child.libraries);

    if child.main_class.as_deref().is_none_or(str::is_empty) {
        return Err(format!("inherited version {} has no mainClass", child.id));
    }
    if child.asset_index.is_none()
        || child
            .downloads
            .as_ref()
            .and_then(|d| d.client.as_ref())
            .is_none()
    {
        return Err(format!(
            "inherited version {} lacks vanilla assets or client jar",
            child.id
        ));
    }
    Ok(child)
}

pub(crate) fn validate_version_id(id: &str) -> Result<(), String> {
    let reserved_stem = id
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let is_windows_device_name = matches!(reserved_stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (reserved_stem.len() == 4
            && (reserved_stem.starts_with("COM") || reserved_stem.starts_with("LPT"))
            && matches!(reserved_stem.as_bytes()[3], b'1'..=b'9'));

    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b' '))
        || id.starts_with(' ')
        || id.ends_with([' ', '.'])
        || id == "."
        || id == ".."
        || is_windows_device_name
    {
        return Err("version id is not a safe single path component".to_owned());
    }
    Ok(())
}

fn validate_https_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "metadata URL is invalid".to_owned())?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("metadata URL must be a safe HTTPS URL".to_owned());
    }
    Ok(())
}

fn validate_sha1(hash: &str, kind: &str) -> Result<(), String> {
    if hash.len() != 40 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!("{kind} SHA-1 must be 40 hexadecimal characters"));
    }
    Ok(())
}

fn validate_asset_index_reference(reference: &AssetIndexReference) -> Result<(), String> {
    validate_version_id(&reference.id)?;
    validate_sha1(&reference.sha1, "asset index")?;
    validate_https_url(&reference.url)
}

fn validate_asset_sizes(index: &AssetIndex) -> Result<(), String> {
    let mut size_by_hash = BTreeMap::<String, u64>::new();
    for object in index.objects.values() {
        let hash = object.hash.to_ascii_lowercase();
        if let Some(previous) = size_by_hash.insert(hash.clone(), object.size) {
            if previous != object.size {
                return Err(format!("asset hash {hash} has conflicting sizes"));
            }
        }
    }
    Ok(())
}

fn merge_downloads(
    parent: Option<&VersionDownloads>,
    child: Option<VersionDownloads>,
) -> Option<VersionDownloads> {
    let parent = parent.cloned().unwrap_or(VersionDownloads {
        client: None,
        client_mappings: None,
    });
    match child {
        Some(child) => Some(VersionDownloads {
            client: child.client.or(parent.client),
            client_mappings: child.client_mappings.or(parent.client_mappings),
        }),
        None => Some(parent),
    }
}

fn merge_arguments(
    parent: Option<&VersionArguments>,
    child: Option<VersionArguments>,
) -> Option<VersionArguments> {
    if parent.is_none() && child.is_none() {
        return None;
    }
    let mut merged = parent.cloned().unwrap_or(VersionArguments {
        game: Vec::new(),
        jvm: Vec::new(),
    });
    if let Some(child) = child {
        merged.game.extend(child.game);
        merged.jvm.extend(child.jvm);
    }
    Some(merged)
}

fn merge_libraries(parent: &[Library], child: &[Library]) -> Vec<Library> {
    let mut merged = Vec::<Library>::with_capacity(parent.len() + child.len());
    let mut index_by_key = BTreeMap::<String, usize>::new();
    for library in parent.iter().chain(child) {
        let key = library_key(&library.name);
        if let Some(index) = index_by_key.get(&key).copied() {
            merged[index] = library.clone();
        } else {
            index_by_key.insert(key, merged.len());
            merged.push(library.clone());
        }
    }
    merged
}

fn library_key(name: &str) -> String {
    let parts = name.split(':').collect::<Vec<_>>();
    match parts.as_slice() {
        [group, artifact, _version] => format!("{group}:{artifact}"),
        [group, artifact, _version, classifier, ..] => {
            format!("{group}:{artifact}:{classifier}")
        }
        _ => name.to_owned(),
    }
}

#[cfg(test)]
#[path = "metadata/tests.rs"]
mod tests;
