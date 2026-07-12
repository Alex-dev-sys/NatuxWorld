package ru.vibestudy.natuxplugin;

import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.util.BoundingBox;
import org.bukkit.util.Vector;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Conservative, server-authoritative checks for the exploit classes a launcher
 * cannot reliably prevent. Thresholds live in config.yml because PvP, parkour and
 * custom items vary wildly between Minecraft servers.
 */
public final class AntiCheatListener implements Listener {
    private final NatuxPlugin plugin;
    private final ViolationTracker violations = new ViolationTracker();
    private final Map<UUID, Long> graceUntil = new HashMap<>();
    private final Map<UUID, Integer> hoverTicks = new HashMap<>();
    private final Map<UUID, Deque<Long>> attackTimes = new HashMap<>();

    public AntiCheatListener(NatuxPlugin plugin) {
        this.plugin = plugin;
    }

    private boolean enabled() {
        return plugin.getConfig().getBoolean("anticheat.enabled", true);
    }

    private boolean bypass(Player player) {
        return player.hasPermission(plugin.getConfig().getString("anticheat.bypass_permission", "natux.anticheat.bypass"))
                || player.getGameMode() == GameMode.CREATIVE
                || player.getGameMode() == GameMode.SPECTATOR;
    }

    private boolean inGrace(Player player) {
        return graceUntil.getOrDefault(player.getUniqueId(), 0L) > System.currentTimeMillis();
    }

    private void grantGrace(Player player) {
        long ticks = Math.max(0, plugin.getConfig().getLong("anticheat.teleport_grace_ticks", 60));
        graceUntil.put(player.getUniqueId(), System.currentTimeMillis() + ticks * 50L);
        hoverTicks.remove(player.getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        grantGrace(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        grantGrace(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        violations.clear(id);
        graceUntil.remove(id);
        hoverTicks.remove(id);
        attackTimes.remove(id);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!enabled()) return;
        Player player = event.getPlayer();
        Location from = event.getFrom();
        Location to = event.getTo();
        if (to == null || bypass(player) || inGrace(player) || isMovementExempt(player)) return;

        double horizontal = horizontalDistance(from, to);
        double upward = to.getY() - from.getY();
        double maxHorizontal = Math.max(0.5D, plugin.getConfig().getDouble("anticheat.movement.max_horizontal_per_move", 1.15D));
        double maxUpward = Math.max(0.8D, plugin.getConfig().getDouble("anticheat.movement.max_upward_per_move", 1.35D));

        // Speed / blink: a normal sprint is roughly 0.3 blocks per tick. The default
        // is intentionally generous to avoid false positives from lag or custom gear.
        if (horizontal > maxHorizontal) {
            event.setTo(from);
            flag(player, "speed", String.format("horizontal=%.2f limit=%.2f", horizontal, maxHorizontal));
            return;
        }

        // Legitimate jump/knockback velocity is much smaller than the conservative
        // limit. Skip a player who currently has an upward server velocity.
        if (upward > maxUpward && player.getVelocity().getY() < maxUpward * 0.75D) {
            event.setTo(from);
            flag(player, "fly", String.format("upward=%.2f limit=%.2f", upward, maxUpward));
            return;
        }

        if (updateHoverCheck(player, from, to)) event.setTo(from);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        if (!enabled() || !(event.getDamager() instanceof Player player) || bypass(player) || inGrace(player)) return;
        Entity target = event.getEntity();

        double maxReach = Math.max(3.5D, plugin.getConfig().getDouble("anticheat.combat.max_reach", 4.5D));
        double reach = distanceToBox(player.getEyeLocation().toVector(), target.getBoundingBox());
        if (reach > maxReach) {
            if (plugin.getConfig().getBoolean("anticheat.combat.cancel_reach", true)) event.setCancelled(true);
            flag(player, "reach", String.format("reach=%.2f limit=%.2f target=%s", reach, maxReach, target.getType()));
            return;
        }

        trackClickRate(player);
    }

    private boolean isMovementExempt(Player player) {
        return player.isFlying() || player.isGliding() || player.isRiptiding()
                || player.isInsideVehicle() || player.isSwimming() || player.isDead();
    }

    /** @return true when the current move should be rolled back. */
    private boolean updateHoverCheck(Player player, Location from, Location to) {
        UUID id = player.getUniqueId();
        boolean nearlyStillInAir = Math.abs(to.getY() - from.getY()) < 0.035D
                && to.clone().subtract(0D, 0.15D, 0D).getBlock().getType().isAir();
        if (!nearlyStillInAir) {
            hoverTicks.remove(id);
            return false;
        }

        int ticks = hoverTicks.merge(id, 1, Integer::sum);
        int limit = Math.max(20, plugin.getConfig().getInt("anticheat.movement.hover_ticks", 40));
        if (ticks > limit) {
            // The current move is rolled back rather than teleporting the player to an
            // arbitrary location; that makes correction predictable and reversible.
            flag(player, "fly", "hover_ticks=" + ticks + " limit=" + limit);
            return true;
        }
        return false;
    }

    private void trackClickRate(Player player) {
        long now = System.currentTimeMillis();
        Deque<Long> clicks = attackTimes.computeIfAbsent(player.getUniqueId(), ignored -> new ArrayDeque<>());
        while (!clicks.isEmpty() && now - clicks.peekFirst() > 1000L) clicks.removeFirst();
        clicks.addLast(now);

        int maxCps = Math.max(12, plugin.getConfig().getInt("anticheat.combat.max_cps", 18));
        if (clicks.size() > maxCps) {
            // Click-rate is evidence only. Fast-clicking can be legitimate, so unlike
            // impossible movement/reach it never cancels an attack or bans a player.
            flag(player, "click-rate", "cps=" + clicks.size() + " limit=" + maxCps);
        }
    }

    private void flag(Player player, String check, String detail) {
        long now = System.currentTimeMillis();
        int threshold = Math.max(1, plugin.getConfig().getInt("anticheat.warning_threshold", 3));
        int interval = Math.max(1, plugin.getConfig().getInt("anticheat.warning_interval", 3));
        long reset = Math.max(1000L, plugin.getConfig().getLong("anticheat.reset_after_seconds", 60) * 1000L);
        long cooldown = Math.max(1000L, plugin.getConfig().getLong("anticheat.log_cooldown_seconds", 5) * 1000L);
        ViolationTracker.Result result = violations.record(player.getUniqueId(), check, now, threshold, interval, reset, cooldown);

        if (result.warn()) {
            player.sendMessage("§c[NATUX] Подозрительное действие обнаружено. Читы запрещены.");
            String alert = "§c[NATUX AC] " + player.getName() + " " + check + " VL=" + result.level() + " (" + detail + ")";
            for (Player online : plugin.getServer().getOnlinePlayers()) {
                if (online.hasPermission("natux.anticheat.alert")) online.sendMessage(alert);
            }
        }

        if (result.log()) {
            plugin.getLogger().warning("AC " + player.getName() + " " + check + " VL=" + result.level() + " " + detail);
            plugin.pushAntiCheatEvent(player, check, detail, result.level());
        }
    }

    private static double horizontalDistance(Location a, Location b) {
        double dx = b.getX() - a.getX();
        double dz = b.getZ() - a.getZ();
        return Math.sqrt(dx * dx + dz * dz);
    }

    /** Shortest distance from a point to an entity hitbox; much less noisy than entity center distance. */
    private static double distanceToBox(Vector point, BoundingBox box) {
        double x = clamp(point.getX(), box.getMinX(), box.getMaxX());
        double y = clamp(point.getY(), box.getMinY(), box.getMaxY());
        double z = clamp(point.getZ(), box.getMinZ(), box.getMaxZ());
        return point.distance(new Vector(x, y, z));
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
