package dev.kindsmp;

import java.util.function.BooleanSupplier;

/** Bounds each polling pass while allowing an offline backlog to drain without per-job delays. */
final class QueueDrain {
    @FunctionalInterface interface Next { boolean process() throws Exception; }
    static int drain(int limit, BooleanSupplier running, Next next) throws Exception {
        int processed = 0;
        while (processed < limit && running.getAsBoolean() && next.process()) processed++;
        return processed;
    }
}
