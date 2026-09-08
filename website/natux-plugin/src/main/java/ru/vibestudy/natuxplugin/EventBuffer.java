package ru.vibestudy.natuxplugin;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.io.File;
import java.io.Reader;
import java.io.Writer;
import java.io.FileReader;
import java.io.FileWriter;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.atomic.AtomicLong;

public class EventBuffer {
    private final LinkedBlockingDeque<GameEvent> queue;
    private final int maxBatch;
    private final AtomicLong dropped = new AtomicLong();

    public EventBuffer(int maxBatch, int maxQueue) {
        this.maxBatch = maxBatch;
        this.queue = new LinkedBlockingDeque<>(Math.max(maxBatch, maxQueue));
    }

    public void add(GameEvent event) {
        if (!queue.offerLast(event)) {
            queue.pollFirst(); // bounded memory: discard the oldest event
            queue.offerLast(event);
            dropped.incrementAndGet();
        }
    }

    public List<GameEvent> drain() {
        List<GameEvent> batch = new ArrayList<>(maxBatch);
        GameEvent e;
        while (batch.size() < maxBatch && (e = queue.pollFirst()) != null) {
            batch.add(e);
        }
        return batch;
    }

    public boolean isEmpty() {
        return queue.isEmpty();
    }

    /** Put an unsuccessful batch back at the front, preserving its original order. */
    public void restore(List<GameEvent> events) {
        for (int i = events.size() - 1; i >= 0; i--) {
            if (!queue.offerFirst(events.get(i))) {
                queue.pollLast(); // keep the older retry batch over newer telemetry
                queue.offerFirst(events.get(i));
                dropped.incrementAndGet();
            }
        }
    }

    public long drainDroppedCount() {
        return dropped.getAndSet(0);
    }

    public int size() {
        return queue.size();
    }

    /** Everything still queued, oldest first. Used to spool a remainder to disk. */
    public List<GameEvent> drainAll() {
        List<GameEvent> all = new ArrayList<>(queue.size());
        GameEvent e;
        while ((e = queue.pollFirst()) != null) {
            all.add(e);
        }
        return all;
    }

    private static final Gson GSON = new Gson();
    private static final Type EVENT_LIST = new TypeToken<List<GameEvent>>() {}.getType();

    /** Everything currently queued, without removing it. */
    public List<GameEvent> snapshot() {
        return new ArrayList<>(queue);
    }

    /**
     * Writes the remaining events to disk so a shutdown does not silently lose
     * them. Deletes the file when there is nothing left to keep.
     *
     * Reads without draining: a throw part-way through must not leave the events
     * gone from the queue AND absent from the file.
     */
    public void spoolTo(File file) throws Exception {
        List<GameEvent> remaining = snapshot();
        if (remaining.isEmpty()) {
            if (file.exists() && !file.delete()) {
                throw new IllegalStateException("Could not delete stale spool file " + file);
            }
            return;
        }
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Could not create spool directory " + parent);
        }
        try (Writer w = new FileWriter(file, StandardCharsets.UTF_8)) {
            GSON.toJson(remaining, EVENT_LIST, w);
        }
    }

    /** Restores a previous run's spooled events, then removes the file. */
    public int loadFrom(File file) throws Exception {
        if (!file.exists()) return 0;
        List<GameEvent> spooled;
        try (Reader r = new FileReader(file, StandardCharsets.UTF_8)) {
            spooled = GSON.fromJson(r, EVENT_LIST);
        }
        if (!file.delete()) {
            throw new IllegalStateException("Could not delete spool file after loading " + file);
        }
        if (spooled == null) return 0;
        for (GameEvent e : spooled) {
            if (e != null) add(e);
        }
        return spooled.size();
    }
}
