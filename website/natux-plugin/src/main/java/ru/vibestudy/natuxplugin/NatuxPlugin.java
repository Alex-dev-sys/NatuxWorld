package ru.vibestudy.natuxplugin;

import org.bukkit.plugin.java.JavaPlugin;

public class NatuxPlugin extends JavaPlugin {

    private EventBuffer buffer;
    private ApiSender sender;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        // Preserve an operator's existing API key/settings while appending defaults
        // introduced by newer plugin releases (notably the anti-cheat section).
        getConfig().options().copyDefaults(true);
        saveConfig();

        String apiUrl = getConfig().getString("api.url", "http://127.0.0.1:3000/api/game-event");
        String apiKey = getConfig().getString("api.key", "");
        int flushInterval = getConfig().getInt("flush_interval", 5);
        int batchSize = getConfig().getInt("batch_size", 100);
        int maxQueue = getConfig().getInt("max_queue", 10000);

        buffer = new EventBuffer(batchSize, maxQueue);
        sender = new ApiSender(this, apiUrl, apiKey);

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);
        getServer().getPluginManager().registerEvents(new AntiCheatListener(this), this);

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

    /** Persist anti-cheat evidence through the same authenticated event pipeline as game activity. */
    public void pushAntiCheatEvent(org.bukkit.entity.Player player, String check, String detail, int level) {
        org.bukkit.Location loc = player.getLocation();
        String world = loc.getWorld() != null ? loc.getWorld().getName() : "";
        buffer.add(new GameEvent(
                player.getName(),
                "anticheat",
                check.toUpperCase() + " VL=" + level,
                world,
                loc.getX(), loc.getY(), loc.getZ(),
                detail
        ));
    }
}
