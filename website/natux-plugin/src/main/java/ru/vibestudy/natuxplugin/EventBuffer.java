package ru.vibestudy.natuxplugin;

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
}
