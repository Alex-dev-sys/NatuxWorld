package ru.vibestudy.natuxplugin;

import com.google.gson.Gson;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Collections;

public class ApiSender {
    private final NatuxPlugin plugin;
    private final String apiUrl;
    private final String apiKey;
    private final Gson gson = new Gson();
    // Telemetry must not travel over plaintext HTTP to a non-local host.
    private final boolean plaintextBlocked;

    public ApiSender(NatuxPlugin plugin, String apiUrl, String apiKey) {
        this.plugin = plugin;
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.plaintextBlocked = isPlaintextRemote(apiUrl);
    }

    private static boolean isPlaintextRemote(String url) {
        try {
            URL u = new URL(url);
            String host = u.getHost() == null ? "" : u.getHost();
            boolean loopback = host.equals("127.0.0.1") || host.equalsIgnoreCase("localhost") || host.equals("::1");
            return "http".equalsIgnoreCase(u.getProtocol()) && !loopback;
        } catch (Exception e) {
            return false; // malformed URL will fail later with a clear error
        }
    }

    /**
     * Sends one batch. Returns false when the batch could not be delivered (it is
     * restored to the buffer), so callers can stop looping instead of hammering a
     * dead endpoint.
     */
    /**
     * Held for the whole drain-send-restore cycle. A batch that has been taken
     * out of the buffer but not yet delivered is invisible to anyone inspecting
     * the queue, so shutdown must not snapshot the buffer in the middle of a
     * send — the in-flight batch would be restored to memory afterwards and die
     * with the JVM.
     */
    private final Object sendLock = new Object();

    /** Runs `action` with no send in flight, so the buffer contents are stable. */
    public void withNoSendInFlight(Runnable action) {
        synchronized (sendLock) {
            action.run();
        }
    }

    public boolean flush(EventBuffer buffer) {
        synchronized (sendLock) {
            return flushLocked(buffer);
        }
    }

    private boolean flushLocked(EventBuffer buffer) {
        if (buffer.isEmpty()) return true;
        List<GameEvent> events = buffer.drain();
        if (events.isEmpty()) return true;

        if (plaintextBlocked) {
            plugin.getLogger().warning(
                "Refusing to send telemetry over plaintext HTTP to a remote host (" + apiUrl + "). " +
                "Use HTTPS or keep the API on localhost.");
            buffer.restore(events);
            return false;
        }

        boolean ok = true;
        try {
            String body = gson.toJson(Collections.singletonMap("events", events));

            URL url = new URL(apiUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("X-Api-Key", apiKey);
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                plugin.getLogger().warning("API returned " + status + " for " + events.size() + " events");
                buffer.restore(events);
                ok = false;
            }
            conn.disconnect();
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to send events: " + e.getMessage());
            buffer.restore(events);
            ok = false;
        }

        long dropped = buffer.drainDroppedCount();
        if (dropped > 0) plugin.getLogger().warning("Event queue overflow: dropped " + dropped + " events");
        return ok;
    }

    /**
     * Drains as many batches as fit in `budgetMillis`. drain() hands out at most
     * one batch, so a single flush on shutdown left everything beyond batch_size
     * in memory — and it died with the process. Bounded by both the budget and a
     * failed send, so stopping the server is never blocked by network retries.
     */
    public void flushUntilEmpty(EventBuffer buffer, long budgetMillis) {
        long deadline = System.nanoTime() + budgetMillis * 1_000_000L;
        while (!buffer.isEmpty() && System.nanoTime() < deadline) {
            if (!flush(buffer)) return;
        }
    }
}
