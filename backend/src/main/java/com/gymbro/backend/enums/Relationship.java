package com.gymbro.backend.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** How a directory entry relates to the caller, so the UI can pick the right button. */
public enum Relationship {

    SELF("self"),
    FRIEND("friend"),
    INCOMING("incoming"),
    OUTGOING("outgoing"),
    NONE("none");

    private final String code;

    Relationship(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }

    @JsonCreator
    public static Relationship fromCode(String raw) {
        if (raw == null) {
            return null;
        }
        for (Relationship relationship : values()) {
            if (relationship.code.equalsIgnoreCase(raw)) {
                return relationship;
            }
        }
        throw new IllegalArgumentException("Unknown relationship: " + raw);
    }
}
