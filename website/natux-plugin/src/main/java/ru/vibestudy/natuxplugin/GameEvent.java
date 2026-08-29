package ru.vibestudy.natuxplugin;

public class GameEvent {
    public final String username;
    public final String kind;
    public final String message;
    public final String world;
    public final Double x, y, z;
    public final String extra;

    public GameEvent(String username, String kind, String message, String world, Double x, Double y, Double z, String extra) {
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
