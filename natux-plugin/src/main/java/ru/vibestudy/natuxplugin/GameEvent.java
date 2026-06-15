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

    public String toJson() {
        return String.format(
            "{\"username\":%s,\"kind\":%s,\"message\":%s,\"world\":%s,\"x\":%s,\"y\":%s,\"z\":%s,\"extra\":%s}",
            jsonStr(username), jsonStr(kind), jsonStr(message), jsonStr(world),
            x == null ? "null" : String.format("%.1f", x),
            y == null ? "null" : String.format("%.1f", y),
            z == null ? "null" : String.format("%.1f", z),
            jsonStr(extra)
        );
    }

    private static String jsonStr(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }
}
