use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayOptions {
    pub(crate) version: String,
    #[serde(default)]
    pub(crate) loader: Option<String>,
    #[serde(default)]
    pub(crate) server: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct PlayResult {
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}
