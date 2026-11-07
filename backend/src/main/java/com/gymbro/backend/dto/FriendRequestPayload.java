package com.gymbro.backend.dto;

import jakarta.validation.constraints.NotNull;

/** Body for "add this person as a friend". */
public record FriendRequestPayload(@NotNull Long userId) {
}
