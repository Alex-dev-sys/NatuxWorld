use crate::cancellation::CancellationToken;

use super::PlayOptions;

pub(super) fn resolve_profile(options: &PlayOptions) -> Result<(String, String), String> {
    let raw = options.version.trim();
    if raw.is_empty()
        || raw.len() > 128
        || !raw
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err("Некорректная версия Minecraft".to_owned());
    }
    let (inferred_loader, inferred_version) = if let Some(version) = raw.strip_prefix("forge-") {
        ("forge", version)
    } else if let Some(version) = raw.strip_prefix("fabric-") {
        ("fabric", version)
    } else if let Some(version) = raw.strip_prefix("neoforge-") {
        ("neoforge", version)
    } else {
        ("vanilla", raw)
    };
    let loader = options.loader.as_deref().unwrap_or(inferred_loader);
    if loader != inferred_loader && inferred_loader != "vanilla" {
        return Err("Тип загрузчика не совпадает с выбранной версией".to_owned());
    }
    let version = if inferred_loader == "vanilla" && loader == "forge" {
        raw
    } else {
        inferred_version
    };
    if !(3..=64).contains(&version.len())
        || version.starts_with('.')
        || version.ends_with('.')
        || version.contains("..")
    {
        return Err("Некорректная версия Minecraft".to_owned());
    }
    if !matches!(loader, "vanilla" | "forge") {
        return Err(format!("Загрузчик {loader} пока не поддерживается"));
    }
    Ok((loader.to_owned(), version.to_owned()))
}

pub(super) fn sanitize_server(value: &str) -> Result<String, String> {
    if value.is_empty() || value.len() > 260 || value.bytes().any(|byte| !byte.is_ascii()) {
        return Err("Некорректный адрес игрового сервера".to_owned());
    }
    let mut parts = value.split(':');
    let host = parts.next().unwrap_or_default();
    let port = parts.next();
    if parts.next().is_some() || host.is_empty() || host.starts_with('.') || host.ends_with('.') {
        return Err("Некорректный адрес игрового сервера".to_owned());
    }
    if host.split('.').any(|label| {
        label.is_empty()
            || label.len() > 63
            || label.starts_with('-')
            || label.ends_with('-')
            || !label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    }) {
        return Err("Некорректный адрес игрового сервера".to_owned());
    }
    if let Some(port) = port {
        if port.is_empty()
            || port.len() > 5
            || !port.bytes().all(|byte| byte.is_ascii_digit())
            || port
                .parse::<u16>()
                .ok()
                .filter(|value| *value > 0)
                .is_none()
        {
            return Err("Некорректный порт игрового сервера".to_owned());
        }
    }
    Ok(value.to_owned())
}

pub(super) fn check_cancelled(cancellation: &CancellationToken) -> Result<(), String> {
    if cancellation.is_cancelled() {
        Err("Отменено".to_owned())
    } else {
        Ok(())
    }
}

pub(super) fn io_message(error: std::io::Error) -> String {
    format!("Minecraft data operation failed: {error}")
}
