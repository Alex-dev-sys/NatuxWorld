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

        // Pick up whatever the previous shutdown could not deliver.
        try {
            int restored = buffer.loadFrom(spoolFile());
            if (restored > 0) getLogger().info("Restored " + restored + " events spooled at last shutdown.");
        } catch (Exception e) {
            getLogger().warning("Could not restore spooled events: " + e.getMessage());
        }

        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);
        getServer().getPluginManager().registerEvents(new AntiCheatListener(this), this);

        // Flush buffer on schedule
        getServer().getScheduler().runTaskTimerAsynchronously(this, () -> {
            sender.flush(buffer);
        }, flushInterval * 20L, flushInterval * 20L);

        getLogger().info("NatuxPlugin enabled — sending to " + apiUrl);
    }

    /** Where undelivered events wait between server runs. */
    private java.io.File spoolFile() {
        return new java.io.File(getDataFolder(), "pending-events.json");
    }

    @Override
    public void onDisable() {
        // Stop the periodic flush first, so no new send starts while we drain.
        // (This does not interrupt one already running — the sender's lock below
        // covers that.)
        getServer().getScheduler().cancelTasks(this);

        // Drain repeatedly within a time budget — one flush only ever sent a
        // single batch, so a queue larger than batch_size lost the remainder.
        if (buffer != null && sender != null) {
            sender.flushUntilEmpty(buffer, 5000L);
            // Whatever is still queued survives on disk instead of dying with
            // the process; onEnable loads it back. Taken under the sender's lock
            // so an in-flight batch is either delivered or already restored to
            // the queue — otherwise it would be invisible here and then lost.
            sender.withNoSendInFlight(() -> {
                try {
                    int left = buffer.size();
                    buffer.spoolTo(spoolFile());
                    if (left > 0) getLogger().info("Spooled " + left + " undelivered events for the next start.");
                } catch (Exception e) {
                    getLogger().warning("Could not spool undelivered events: " + e.getMessage());
                }
            });
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
