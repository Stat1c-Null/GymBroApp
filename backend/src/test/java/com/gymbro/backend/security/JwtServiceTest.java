package com.gymbro.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.gymbro.backend.config.JwtProperties;

class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-123456";

    private JwtService serviceWithTtl(Duration ttl) {
        return new JwtService(new JwtProperties(SECRET, ttl));
    }

    @Test
    void roundTripsTheClaims() {
        JwtService jwt = serviceWithTtl(Duration.ofHours(1));

        String token = jwt.issue(42L, "nick@example.com", "nick");

        AuthenticatedUser user = jwt.parse(token);
        assertThat(user.id()).isEqualTo(42L);
        assertThat(user.email()).isEqualTo("nick@example.com");
        assertThat(user.username()).isEqualTo("nick");
    }

    @Test
    void rejectsATamperedPayload() {
        JwtService jwt = serviceWithTtl(Duration.ofHours(1));
        String token = jwt.issue(1L, "a@b.c", "a");

        String[] parts = token.split("\\.");
        String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"sub\":\"2\",\"exp\":9999999999}".getBytes());
        String forged = parts[0] + "." + forgedPayload + "." + parts[2];

        assertThatThrownBy(() -> jwt.parse(forged))
                .isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsGarbage() {
        assertThatThrownBy(() -> serviceWithTtl(Duration.ofHours(1)).parse("not-a-token"))
                .isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsAnExpiredToken() throws InterruptedException {
        JwtService jwt = serviceWithTtl(Duration.ofMillis(500));
        String token = jwt.issue(1L, "a@b.c", "a");

        Thread.sleep(700);

        assertThatThrownBy(() -> jwt.parse(token))
                .isInstanceOf(InvalidTokenException.class)
                .hasMessageContaining("expired");
    }
}
