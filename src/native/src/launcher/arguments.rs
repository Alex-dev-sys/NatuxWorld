use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::account::GameSessionCredentials;
use crate::metadata::{
    evaluate_rules, resolve_game_arguments, resolve_jvm_arguments, OsName, Platform,
    VersionMetadata,
};
use crate::settings::LauncherSettings;

pub(crate) struct LaunchArguments {
    pub(crate) java_path: PathBuf,
    pub(crate) working_dir: PathBuf,
    pub(crate) args: Vec<String>,
    pub(crate) access_token: String,
}

pub(crate) struct LaunchPaths<'a> {
    pub(crate) root: &'a Path,
    pub(crate) lock_agent_jar: &'a Path,
}

pub(crate) fn build_launch_arguments(
    version: &VersionMetadata,
    vanilla_version_id: &str,
    paths: LaunchPaths<'_>,
    java_path: &Path,
    settings: &LauncherSettings,
    credentials: &GameSessionCredentials,
    server: Option<&str>,
) -> Result<LaunchArguments, String> {
    let root = paths.root;
    let lock_agent_jar = paths.lock_agent_jar;
    let main_class = version
        .main_class
        .as_deref()
        .filter(|value| safe_main_class(value))
        .ok_or_else(|| "Minecraft metadata has no valid main class".to_owned())?;
    let platform = Platform::current();
    let client_jar = root
        .join("versions")
        .join(vanilla_version_id)
        .join(format!("{vanilla_version_id}.jar"));
    ensure_regular_file(&client_jar)?;
    let natives_dir = root
        .join("versions")
        .join(vanilla_version_id)
        .join("natives");
    ensure_regular_file(lock_agent_jar)?;
    let classpath = build_classpath(version, root, &client_jar, &platform)?;
    let asset_index = version
        .asset_index
        .as_ref()
        .ok_or_else(|| "Minecraft version has no asset index".to_owned())?;
    let uuid = credentials.uuid.replace('-', "").to_ascii_lowercase();
    let values = BTreeMap::from([
        ("auth_player_name".to_owned(), credentials.username.clone()),
        ("auth_uuid".to_owned(), uuid),
        (
            "auth_access_token".to_owned(),
            credentials.access_token.clone(),
        ),
        ("user_type".to_owned(), "msa".to_owned()),
        ("user_properties".to_owned(), "{}".to_owned()),
        ("clientid".to_owned(), String::new()),
        ("auth_xuid".to_owned(), String::new()),
        ("version_name".to_owned(), version.id.clone()),
        (
            "version_type".to_owned(),
            version
                .version_type
                .clone()
                .unwrap_or_else(|| "release".to_owned()),
        ),
        (
            "game_directory".to_owned(),
            root.to_string_lossy().into_owned(),
        ),
        (
            "assets_root".to_owned(),
            root.join("assets").to_string_lossy().into_owned(),
        ),
        ("assets_index_name".to_owned(), asset_index.id.clone()),
        (
            "natives_directory".to_owned(),
            natives_dir.to_string_lossy().into_owned(),
        ),
        (
            "library_directory".to_owned(),
            root.join("libraries").to_string_lossy().into_owned(),
        ),
        ("launcher_name".to_owned(), "NATUX_WORLD".to_owned()),
        (
            "launcher_version".to_owned(),
            env!("CARGO_PKG_VERSION").to_owned(),
        ),
        ("classpath".to_owned(), classpath.clone()),
        (
            "classpath_separator".to_owned(),
            classpath_separator().to_string(),
        ),
        (
            "resolution_width".to_owned(),
            settings.resolution.width.to_string(),
        ),
        (
            "resolution_height".to_owned(),
            settings.resolution.height.to_string(),
        ),
        (
            "quickPlayMultiplayer".to_owned(),
            server.unwrap_or_default().to_owned(),
        ),
    ]);
    let mut features = BTreeMap::new();
    features.insert("has_custom_resolution".to_owned(), !settings.fullscreen);
    features.insert("is_demo_user".to_owned(), false);
    features.insert("has_quick_plays_support".to_owned(), server.is_some());

    let mut jvm_args = vec![
        format!("-javaagent:{}", lock_agent_jar.display()),
        format!(
            "-javaagent:{}=https://vibestudy.ru/api/yggdrasil",
            root.join("runtime/authlib-injector.jar").display()
        ),
        format!("-Xmx{}M", settings.memory.clamp(512, 65_536)),
        format!("-Xms{}M", settings.memory.clamp(512, 1024)),
        format!("-Djava.library.path={}", natives_dir.display()),
        "-Dminecraft.launcher.brand=NATUX_WORLD".to_owned(),
        format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")),
    ];
    jvm_args.extend(resolve_jvm_arguments(
        version, &values, &platform, &features,
    ));
    if !has_classpath_option(&jvm_args) {
        jvm_args.push("-cp".to_owned());
        jvm_args.push(classpath);
    }
    jvm_args.push(main_class.to_owned());

    let mut game_args = resolve_game_arguments(version, &values, &platform, &features);
    if let Some(server) = server {
        if !has_flag(&game_args, "--quickPlayMultiplayer") {
            game_args.extend(["--quickPlayMultiplayer".to_owned(), server.to_owned()]);
        }
    }
    if settings.fullscreen {
        if !has_flag(&game_args, "--fullscreen") {
            game_args.push("--fullscreen".to_owned());
        }
    } else if !has_flag(&game_args, "--width") && !has_flag(&game_args, "--height") {
        game_args.extend([
            "--width".to_owned(),
            settings.resolution.width.to_string(),
            "--height".to_owned(),
            settings.resolution.height.to_string(),
        ]);
    }

    Ok(LaunchArguments {
        java_path: console_java_path(java_path),
        working_dir: root.to_path_buf(),
        args: [jvm_args, game_args].concat(),
        access_token: credentials.access_token.clone(),
    })
}

fn build_classpath(
    version: &VersionMetadata,
    root: &Path,
    client_jar: &Path,
    platform: &Platform,
) -> Result<String, String> {
    let mut paths = Vec::<PathBuf>::new();
    let mut seen = std::collections::HashSet::new();
    for library in &version.libraries {
        if !evaluate_rules(library.rules.as_deref(), platform, &BTreeMap::new())
            || is_native_classifier(&library.name, platform.os)
        {
            continue;
        }
        let Some(artifact) = library
            .downloads
            .as_ref()
            .and_then(|downloads| downloads.artifact.as_ref())
        else {
            continue;
        };
        let relative = match artifact.path.as_deref() {
            Some(path) => PathBuf::from(path),
            None => maven_path(&library.name).ok_or_else(|| {
                format!(
                    "Minecraft library {} has no safe artifact path",
                    library.name
                )
            })?,
        };
        validate_relative_path(&relative)?;
        let absolute = root.join("libraries").join(relative);
        ensure_regular_file(&absolute)?;
        if seen.insert(absolute.clone()) {
            paths.push(absolute);
        }
    }
    if seen.insert(client_jar.to_path_buf()) {
        paths.push(client_jar.to_path_buf());
    }
    let separator = classpath_separator();
    if paths
        .iter()
        .any(|path| path.to_string_lossy().contains(separator))
    {
        return Err("Minecraft data path contains the classpath separator".to_owned());
    }
    Ok(paths
        .iter()
        .map(|path| path.to_string_lossy())
        .collect::<Vec<_>>()
        .join(&separator.to_string()))
}

fn maven_path(name: &str) -> Option<PathBuf> {
    let (coordinates, extension) = name.split_once('@').unwrap_or((name, "jar"));
    let parts = coordinates.split(':').collect::<Vec<_>>();
    let [group, artifact, version] = parts.as_slice() else {
        let [group, artifact, version, classifier] = parts.as_slice() else {
            return None;
        };
        return maven_artifact(group, artifact, version, Some(classifier), extension);
    };
    maven_artifact(group, artifact, version, None, extension)
}

fn maven_artifact(
    group: &str,
    artifact: &str,
    version: &str,
    classifier: Option<&str>,
    extension: &str,
) -> Option<PathBuf> {
    let valid = |value: &str| {
        !value.is_empty()
            && value.len() <= 128
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'+')
            })
    };
    if !valid(artifact)
        || !valid(version)
        || !valid(extension)
        || classifier.is_some_and(|value| !valid(value))
        || group.split('.').any(|value| !valid(value))
    {
        return None;
    }
    let mut path = PathBuf::new();
    for component in group.split('.') {
        path.push(component);
    }
    path.push(artifact);
    path.push(version);
    let classifier = classifier
        .map(|value| format!("-{value}"))
        .unwrap_or_default();
    path.push(format!("{artifact}-{version}{classifier}.{extension}"));
    Some(path)
}

fn is_native_classifier(name: &str, os: OsName) -> bool {
    let Some(classifier) = name.split(':').nth(3) else {
        return false;
    };
    let _ = os;
    classifier.starts_with("natives-")
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    let portable = path.to_string_lossy().replace('\\', "/");
    if portable.is_empty()
        || portable.len() > 4096
        || portable.starts_with('/')
        || portable.contains([':', '\0'])
    {
        return Err("Minecraft library path is unsafe".to_owned());
    }
    for component in Path::new(&portable).components() {
        let Component::Normal(name) = component else {
            return Err("Minecraft library path contains traversal".to_owned());
        };
        let name = name.to_string_lossy();
        if name.is_empty() || name.len() > 255 || name.ends_with(['.', ' ']) {
            return Err("Minecraft library path has an invalid component".to_owned());
        }
    }
    Ok(())
}

fn ensure_regular_file(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| format!("required Minecraft file is missing: {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "required Minecraft file is unsafe: {}",
            path.display()
        ));
    }
    Ok(())
}

pub(super) fn ensure_lock_agent_jar(path: &Path) -> Result<(), String> {
    ensure_regular_file(path)
        .map_err(|_| "Не найден или повреждён обязательный защитный агент Minecraft".to_owned())
}

fn safe_main_class(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'$'))
}

fn has_classpath_option(args: &[String]) -> bool {
    args.iter().any(|arg| arg == "-cp" || arg == "-classpath")
}

fn has_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|arg| arg == flag)
}

fn classpath_separator() -> char {
    if cfg!(target_os = "windows") {
        ';'
    } else {
        ':'
    }
}

pub(crate) fn console_java_path(java_path: &Path) -> PathBuf {
    if cfg!(target_os = "windows")
        && java_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("javaw.exe"))
    {
        return java_path.with_file_name("java.exe");
    }
    java_path.to_path_buf()
}

#[cfg(test)]
#[path = "arguments/tests.rs"]
mod tests;
