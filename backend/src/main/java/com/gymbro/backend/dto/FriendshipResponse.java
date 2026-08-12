package com.gymbro.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.gymbro.backend.enums.FriendshipStatus;

/**
 * A friend relationship as the client sees it. {@code members} mirrors the
 * Firestore document shape the Angular app already understands; direction is
 * derived from {@code requesterId}.
 */
public record FriendshipResponse(Long id, Long requesterId, Long addresseeId, List<Long> members,
        FriendshipStatus status, OffsetDateTime createdAt, OffsetDateTime respondedAt) {
}
