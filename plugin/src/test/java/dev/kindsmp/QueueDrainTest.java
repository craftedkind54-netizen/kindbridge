package dev.kindsmp;
import static org.junit.jupiter.api.Assertions.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class QueueDrainTest {
    @Test void drainsSeveralOfflineApprovalsInOnePass() throws Exception {
        AtomicInteger waiting = new AtomicInteger(7);
        assertEquals(7, QueueDrain.drain(20,()->true,()->waiting.getAndDecrement()>0));
    }
    @Test void boundsWorkAndStopsWhenServerDisables() throws Exception {
        AtomicInteger processed = new AtomicInteger();
        assertEquals(20,QueueDrain.drain(20,()->true,()->{processed.incrementAndGet();return true;}));
        assertEquals(20,processed.get());
        assertEquals(0,QueueDrain.drain(20,()->false,()->{fail("Must not fetch after shutdown");return true;}));
    }
    @Test void connectionFailureStopsPassForLaterRetry() {
        AtomicInteger calls = new AtomicInteger();
        assertThrows(Exception.class,()->QueueDrain.drain(20,()->true,()->{calls.incrementAndGet();throw new Exception("offline");}));
        assertEquals(1,calls.get());
    }
}
