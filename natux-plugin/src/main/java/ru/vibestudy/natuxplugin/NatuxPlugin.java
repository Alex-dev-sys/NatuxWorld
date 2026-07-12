package ru.vibestudy.natuxplugin;

import org.bukkit.plugin.java.JavaPlugin;

public class NatuxPlugin extends JavaPlugin {

    private EventBuffer buffer;
    private ApiSender sender;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        String apiUrl = getConfig().getString("api.url", "http://127.0.0.1:3000/api/game-event");
        String apiKey = getConfig().getString("api.key", "");
        int flushInterval = getConfig().getInt("flush_interval", 5);
        int batchSize = getConfig().getInt("batch_size", 100);
        int maxQueue = getConfig().getInt("max_queue", 10000);

        buffer = new EventBuffer(batchSize, maxQueue);
        sender = new ApiSender(this, apiUrl, apiKey);

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        // Flush buffer on schedule
        getServer().getScheduler().runTaskTimerAsynchronously(this, () -> {
            sender.flush(buffer);
        }, flushInterval * 20L, flushInterval * 20L);

        getLogger().info("NatuxPlugin enabled — sending to " + apiUrl);
    }

    @Override
    public void onDisable() {
        // Final flush
        if (buffer != null && sender != null) {
            sender.flush(buffer);
        }
        getLogger().info("NatuxPlugin disabled.");
    }

    public EventBuffer getBuffer() { return buffer; }
}
