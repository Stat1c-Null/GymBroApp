package com.gymbro.backend.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Display unit for cardio distance/elevation. Stored as {@code MI}/{@code KM}. */
public enum DistanceUnit {

    MI("mi"),
    KM("km");

    private final String code;

    DistanceUnit(String code) {
        this.code = code;
    }

    @JsonValue
    public String code() {
        return code;
    }

    @JsonCreator
    public static DistanceUnit fromCode(String raw) {
        if (raw == null) {
            return null;
        }
        for (DistanceUnit unit : values()) {
            if (unit.code.equalsIgnoreCase(raw)) {
                return unit;
            }
        }
        throw new IllegalArgumentException("Unknown distance unit: " + raw);
    }
}
