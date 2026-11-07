package com.gymbro.backend.dto;

import java.time.OffsetDateTime;

/** Public view of an account. Never contains the password hash. */
public record UserResponse(Long id, String email, String username, String displayName,
        OffsetDateTime createdAt) {
}
