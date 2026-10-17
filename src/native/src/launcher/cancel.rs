use super::LauncherService;

impl LauncherService {
    pub(crate) async fn cancel_and_wait(&self) {
        let generation = match self.state.lock() {
            Ok(state) if state.busy => {
                if let Some(token) = &state.cancellation {
                    token.cancel();
                }
                state.generation
            }
            _ => return,
        };

        loop {
            let notified = self.pipeline_finished.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

            let same_pipeline_active = self
                .state
                .lock()
                .map(|state| state.busy && state.generation == generation)
                .unwrap_or(false);
            if !same_pipeline_active {
                return;
            }

            notified.await;
        }
    }
}
