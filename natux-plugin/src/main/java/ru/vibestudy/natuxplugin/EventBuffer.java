package ru.vibestudy.natuxplugin;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

public class EventBuffer {
    private final ConcurrentLinkedQueue<GameEvent> queue = new ConcurrentLinkedQueue<>();
    private final int maxBatch;

    public EventBuffer(int maxBatch) {
        this.maxBatch = maxBatch;
    }

    public void add(GameEvent event) {
        queue.offer(event);
    }

    public List<GameEvent> drain() {
        List<GameEvent> batch = new ArrayList<>(maxBatch);
        GameEvent e;
        while (batch.size() < maxBatch && (e = queue.poll()) != null) {
            batch.add(e);
        }
        return batch;
    }

    public boolean isEmpty() {
        return queue.isEmpty();
    }
}
