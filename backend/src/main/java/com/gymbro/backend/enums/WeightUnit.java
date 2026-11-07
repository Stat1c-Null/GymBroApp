package com.gymbro.backend.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Display unit for lifted/body weights.
 *
 * <p>Stored as the enum name ({@code KG}/{@code LBS}) via
 * {@code @Enumerated(EnumType.STRING)}, but serialized in JSON as the short
 * lowercase code the client already uses ({@code kg}/{@code lbs}).
 */
public enum WeightUnit {

    KG("kg"),
    LBS("lbs");

    private final String code;

    WeightUnit(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }

    @JsonCreator
    public static WeightUnit fromCode(String raw) {
        if (raw == null) {
            return null;
        }
        for (WeightUnit unit : values()) {
            if (unit.code.equalsIgnoreCase(raw)) {
                return unit;
            }
        }
        throw new IllegalArgumentException("Unknown weight unit: " + raw);
    }
}
