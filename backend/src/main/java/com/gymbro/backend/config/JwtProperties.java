package com.gymbro.backend.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT settings, bound from {@code app.jwt.*}.
 *
 * @param secret HMAC-SHA key, at least 32 bytes. Must be overridden in production.
 * @param ttl    how long an issued token stays valid.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration ttl) {

    public JwtProperties {
        if (secret == null || secret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException(
                    "app.jwt.secret must be at least 32 bytes long (256 bits) for HMAC-SHA256");
        }
        if (ttl == null || ttl.isNegative() || ttl.isZero()) {
            throw new IllegalArgumentException("app.jwt.ttl must be a positive duration");
        }
    }
}
