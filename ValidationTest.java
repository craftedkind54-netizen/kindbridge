package dev.kindsmp;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class ValidationTest {
    @Test void rejectsInjectedAndInvalidAccounts() {
        assertThrows(IllegalArgumentException.class,()->Validation.username("java","Alex\nop Steve"));
        assertThrows(IllegalArgumentException.class,()->Validation.username("java","ab"));
        assertThrows(IllegalArgumentException.class,()->Validation.username("bedrock",".Gamertag"));
        assertDoesNotThrow(()->Validation.username("bedrock","Player One"));
        assertDoesNotThrow(()->Validation.username("java","Kind_Player"));
    }
    @Test void rejectsUnsafeOriginsAndMalformedUuids() {
        assertThrows(IllegalArgumentException.class,()->Validation.railway("http://example.com"));
        assertThrows(IllegalArgumentException.class,()->Validation.railway("https://name:secret@example.com"));
        assertThrows(IllegalArgumentException.class,()->Validation.railway("https://example.com/path"));
        assertEquals("https://example.com",Validation.railway("https://example.com/").toString());
        assertThrows(IllegalArgumentException.class,()->Validation.uuid("1-1-1-1-1"));
    }
}
