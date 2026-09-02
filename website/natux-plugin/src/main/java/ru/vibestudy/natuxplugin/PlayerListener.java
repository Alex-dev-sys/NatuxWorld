package ru.vibestudy.natuxplugin;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.*;

import java.util.List;

public class PlayerListener implements Listener {
    private final NatuxPlugin plugin;

    public PlayerListener(NatuxPlugin plugin) {
        this.plugin = plugin;
    }

    private boolean track(String key) {
        return plugin.getConfig().getBoolean("track." + key, true);
    }

    private List<String> importantBlocks() {
        return plugin.getConfig().getStringList("important_blocks");
    }

    private void push(String username, String kind, String message, Location loc, String extra) {
        Double x = loc != null ? loc.getX() : null;
        Double y = loc != null ? loc.getY() : null;
        Double z = loc != null ? loc.getZ() : null;
        String world = loc != null && loc.getWorld() != null ? loc.getWorld().getName() : "";
        plugin.getBuffer().add(new GameEvent(username, kind, message, world, x, y, z, extra));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent e) {
        if (!track("commands")) return;
        // SECURITY: only the command LABEL is sent — never the full line.
        // Arguments routinely contain secrets (/login <pass>, /changepassword,
        // /msg <text>) and must never reach the telemetry store.
        String label = e.getMessage().split(" ", 2)[0].toLowerCase();
        push(e.getPlayer().getName(), "command", label, e.getPlayer().getLocation(), "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent e) {
        if (!track("chat")) return;
        push(e.getPlayer().getName(), "chat", e.getMessage(), e.getPlayer().getLocation(), "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent e) {
        if (!track("block_break")) return;
        String blockType = e.getBlock().getType().name();
        List<String> filter = importantBlocks();
        if (!filter.isEmpty() && !filter.contains(blockType)) return;
        push(e.getPlayer().getName(), "block_break", blockType, e.getBlock().getLocation(), blockType);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockPlace(BlockPlaceEvent e) {
        if (!track("block_place")) return;
        String blockType = e.getBlock().getType().name();
        List<String> filter = importantBlocks();
        if (!filter.isEmpty() && !filter.contains(blockType)) return;
        push(e.getPlayer().getName(), "block_place", blockType, e.getBlock().getLocation(), blockType);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent e) {
        if (!track("join")) return;
        push(e.getPlayer().getName(), "join", "", e.getPlayer().getLocation(), "");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent e) {
        if (!track("quit")) return;
        push(e.getPlayer().getName(), "quit", "", e.getPlayer().getLocation(), "");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(PlayerDeathEvent e) {
        if (!track("death")) return;
        Player p = e.getEntity();
        String deathMsg = e.getDeathMessage() != null ? e.getDeathMessage() : "";
        // Strip color codes
        deathMsg = deathMsg.replaceAll("§[0-9a-fk-or]", "");
        push(p.getName(), "death", deathMsg, p.getLocation(), "");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onKill(org.bukkit.event.entity.EntityDeathEvent e) {
        if (!track("kill")) return;
        if (!(e.getEntity().getKiller() instanceof Player killer)) return;
        String victim = e.getEntity().getName();
        push(killer.getName(), "kill", victim, killer.getLocation(), e.getEntity().getType().name());
    }
}
