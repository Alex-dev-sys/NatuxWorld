use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchProgress {
    pub(crate) stage: String,
    pub(crate) progress: u8,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
}

impl LaunchProgress {
    pub(crate) fn new(stage: &str, progress: u8, message: &str) -> Self {
        Self {
            stage: stage.to_owned(),
            progress: progress.min(100),
            message: message.to_owned(),
            detail: None,
        }
    }

    pub(crate) fn with_detail(mut self, detail: &str) -> Self {
        self.detail = Some(detail.chars().take(160).collect());
        self
    }
}
