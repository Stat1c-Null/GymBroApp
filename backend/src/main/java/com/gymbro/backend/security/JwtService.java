package com.gymbro.backend.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

import com.gymbro.backend.config.JwtProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Issues and verifies the HS256 JSON Web Tokens used as bearer tokens.
 *
 * <p>Implemented on top of {@code javax.crypto} rather than a JWT library: the
 * format needed here is three base64url segments and one HMAC, and keeping it
 * dependency-free means no extra supply-chain surface for the build.
 */
@Service
public class JwtService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String HEADER = base64Url(
            "{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

    private final SecretKeySpec key;
    private final long ttlSeconds;
    private final JsonMapper json = JsonMapper.builder().build();

    public JwtService(JwtProperties properties) {
        this.key = new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
        this.ttlSeconds = properties.ttl().toSeconds();
    }

    public String issue(Long userId, String email, String username) {
        long issuedAt = Instant.now().getEpochSecond();

        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", String.valueOf(userId));
        claims.put("email", email);
        claims.put("username", username);
        claims.put("iat", issuedAt);
        claims.put("exp", issuedAt + ttlSeconds);

        String signingInput = HEADER + "." + base64Url(json.writeValueAsBytes(claims));
        return signingInput + "." + base64Url(sign(signingInput));
    }

    /**
     * @throws InvalidTokenException when the token cannot be trusted
     */
    public AuthenticatedUser parse(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new InvalidTokenException("Malformed token");
        }

        String signingInput = parts[0] + "." + parts[1];
        byte[] expected = sign(signingInput);
        byte[] actual;
        try {
            actual = Base64.getUrlDecoder().decode(parts[2]);
        } catch (IllegalArgumentException ex) {
            throw new InvalidTokenException("Malformed token signature");
        }
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new InvalidTokenException("Bad token signature");
        }

        JsonNode payload;
        try {
            payload = json.readTree(Base64.getUrlDecoder().decode(parts[1]));
        } catch (RuntimeException ex) {
            throw new InvalidTokenException("Malformed token payload");
        }

        long expiresAt = payload.path("exp").asLong(0L);
        if (expiresAt <= Instant.now().getEpochSecond()) {
            throw new InvalidTokenException("Token expired");
        }

        String subject = payload.path("sub").asString(null);
        if (subject == null) {
            throw new InvalidTokenException("Token has no subject");
        }

        try {
            return new AuthenticatedUser(Long.valueOf(subject),
                    payload.path("email").asString(null),
                    payload.path("username").asString(null));
        } catch (NumberFormatException ex) {
            throw new InvalidTokenException("Token subject is not a user id");
        }
    }

    public long ttlSeconds() {
        return ttlSeconds;
    }

    private byte[] sign(String signingInput) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(key);
            return mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not sign the token", ex);
        }
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
