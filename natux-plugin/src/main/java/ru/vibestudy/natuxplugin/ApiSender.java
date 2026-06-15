package ru.vibestudy.natuxplugin;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

public class ApiSender {
    private final NatuxPlugin plugin;
    private final String apiUrl;
    private final String apiKey;

    public ApiSender(NatuxPlugin plugin, String apiUrl, String apiKey) {
        this.plugin = plugin;
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
    }

    public void flush(EventBuffer buffer) {
        if (buffer.isEmpty()) return;
        List<GameEvent> events = buffer.drain();
        if (events.isEmpty()) return;

        try {
            String body = "{\"events\":[" +
                events.stream().map(GameEvent::toJson).collect(Collectors.joining(",")) +
                "]}";

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
            }
            conn.disconnect();
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to send events: " + e.getMessage());
        }
    }
}
