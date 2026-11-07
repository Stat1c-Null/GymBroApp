package com.gymbro.backend.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * State of a friend relationship. One row per pair, so {@code ACCEPTED} is a
 * property of the relationship itself, not of a direction.
 */
public enum FriendshipStatus {

    PENDING("pending"),
    ACCEPTED("accepted");

    private final String code;

    FriendshipStatus(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }

    @JsonCreator
    public static FriendshipStatus fromCode(String raw) {
        if (raw == null) {
            return null;
        }
        for (FriendshipStatus status : values()) {
            if (status.code.equalsIgnoreCase(raw)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown friendship status: " + raw);
    }
}
