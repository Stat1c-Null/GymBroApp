package com.gymbro.backend.security;

/**
 * The authenticated caller, stored as the {@code Authentication} principal.
 * Controllers receive it with {@code @AuthenticationPrincipal}.
 */
public record AuthenticatedUser(Long id, String email, String username) {
}
