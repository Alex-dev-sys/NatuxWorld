package ru.vibestudy.natuxplugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Keeps short-lived, per-player violation levels. This is deliberately in-memory:
 * anti-cheat evidence is sent through GameEvent, while a restart must never carry a
 * stale suspicion over to a player who has reconnected.
 */
public final class ViolationTracker {
    private final Map<UUID, Map<String, State>> states = new HashMap<>();

    public Result record(UUID playerId, String check, long nowMillis, int warningThreshold,
                         int warningInterval, long resetAfterMillis, long logCooldownMillis) {
        Map<String, State> byCheck = states.computeIfAbsent(playerId, ignored -> new HashMap<>());
        State state = byCheck.computeIfAbsent(check, ignored -> new State());

        if (nowMillis - state.lastViolationMillis > resetAfterMillis) state.level = 0;
        state.lastViolationMillis = nowMillis;
        state.level++;

        boolean warn = state.level >= warningThreshold
                && (state.level - warningThreshold) % Math.max(1, warningInterval) == 0;
        boolean log = nowMillis - state.lastLogMillis >= logCooldownMillis;
        if (log) state.lastLogMillis = nowMillis;
        return new Result(state.level, warn, log);
    }

    public void clear(UUID playerId) {
        states.remove(playerId);
    }

    public record Result(int level, boolean warn, boolean log) {}

    private static final class State {
        private int level;
        private long lastViolationMillis;
        // Start at a very old timestamp so the first violation is retained as evidence.
        private long lastLogMillis = Long.MIN_VALUE / 2;
    }
}
