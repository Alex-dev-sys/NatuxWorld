package ru.vibestudy.natuxplugin;

import java.util.UUID;

public class GameEvent {
    public final String eventId;
    public final String username;
    public final String kind;
    public final String message;
    public final String world;
    public final Double x, y, z;
    public final String extra;

    public GameEvent(String username, String kind, String message, String world, Double x, Double y, Double z, String extra) {
        // Client-generated id: the API drops duplicates, so re-sending a batch
        // after an ambiguous timeout can never double-count events.
        this.eventId = UUID.randomUUID().toString();
        this.username = username;
        this.kind = kind;
        this.message = message != null ? message : "";
        this.world = world != null ? world : "";
        this.x = x;
        this.y = y;
        this.z = z;
        this.extra = extra != null ? extra : "";
    }

}
