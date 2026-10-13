use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};

use super::LauncherLog;

const LOCK_READY_LINE: &[u8] = b"NATUX_LOCK_READY_V1";
const MAX_PRE_READY_LINES: usize = 256;
const MAX_PRE_READY_BYTES: usize = 256 * 1024;
pub(super) const LOCK_READY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

pub(super) async fn wait_for_lock_ready<R>(
    mut stdout: BufReader<R>,
    access_token: String,
) -> Result<(BufReader<R>, Vec<LauncherLog>), String>
where
    R: AsyncRead + Unpin,
{
    let mut logs = Vec::new();
    let mut total_bytes = 0usize;
    loop {
        let raw = read_limited_stdout_line(&mut stdout)
            .await
            .map_err(|_| "Java не подтвердила защиту файлов игры".to_owned())?;
        let Some(raw) = raw else {
            return Err("Java завершилась до подтверждения защиты файлов игры".to_owned());
        };
        if raw == LOCK_READY_LINE {
            return Ok((stdout, logs));
        }
        total_bytes = total_bytes.saturating_add(raw.len());
        if logs.len() >= MAX_PRE_READY_LINES || total_bytes > MAX_PRE_READY_BYTES {
            return Err("Java вывела слишком много данных до проверки защиты игры".to_owned());
        }
        let text = String::from_utf8_lossy(&raw).replace(&access_token, "[redacted]");
        logs.push(LauncherLog {
            stream: "stdout".to_owned(),
            line: text,
        });
    }
}

async fn read_limited_stdout_line<R>(reader: &mut BufReader<R>) -> std::io::Result<Option<Vec<u8>>>
where
    R: AsyncRead + Unpin,
{
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf().await?;
        if available.is_empty() {
            return if line.is_empty() {
                Ok(None)
            } else {
                trim_line_ending(&mut line);
                Ok(Some(line))
            };
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(available.len(), |position| position + 1);
        let content_length = newline.map_or(consumed, |position| position);
        if line.len().saturating_add(content_length) > super::MAX_LOG_LINE_BYTES {
            reader.consume(consumed);
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Java startup output line exceeds the limit",
            ));
        }
        line.extend_from_slice(&available[..content_length]);
        reader.consume(consumed);
        if newline.is_some() {
            trim_line_ending(&mut line);
            return Ok(Some(line));
        }
    }
}

fn trim_line_ending(line: &mut Vec<u8>) {
    if line.last() == Some(&b'\r') {
        line.pop();
    }
}

#[cfg(test)]
mod tests {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    use super::wait_for_lock_ready;

    #[tokio::test]
    async fn ready_marker_is_consumed_and_pre_ready_logs_redact_the_game_token() {
        let (mut writer, reader) = tokio::io::duplex(128);
        let output = tokio::spawn(async move {
            writer
                .write_all(
                    b"Java startup token-secret\r\nNATUX_LOCK_READY_V1\r\nMinecraft output\n",
                )
                .await
                .expect("write fake Java output");
        });

        let (mut stdout, logs) = wait_for_lock_ready(BufReader::new(reader), "token-secret".into())
            .await
            .expect("agent marker should confirm the game lock");
        output.await.expect("writer task");

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].line, "Java startup [redacted]");
        assert_eq!(logs[0].stream, "stdout");
        let mut remaining = String::new();
        stdout
            .read_line(&mut remaining)
            .await
            .expect("read game output following readiness");
        assert_eq!(remaining, "Minecraft output\n");
    }

    #[tokio::test]
    async fn missing_ready_marker_fails_closed_when_java_exits() {
        let (mut writer, reader) = tokio::io::duplex(128);
        writer
            .write_all(b"agent failed before Minecraft main\n")
            .await
            .expect("write fake Java failure");
        drop(writer);

        let error = wait_for_lock_ready(BufReader::new(reader), String::new())
            .await
            .expect_err("exit without lock-ready marker must not count as running");
        assert!(error.contains("до подтверждения защиты"));
    }

    #[tokio::test]
    async fn oversized_pre_ready_output_fails_closed() {
        let (mut writer, reader) = tokio::io::duplex(16 * 1024);
        writer
            .write_all(&vec![b'x'; super::super::MAX_LOG_LINE_BYTES + 1])
            .await
            .expect("write oversized line");

        let error = wait_for_lock_ready(BufReader::new(reader), String::new())
            .await
            .expect_err("unbounded startup output must not bypass readiness");
        assert!(error.contains("не подтвердила"));
    }
}
