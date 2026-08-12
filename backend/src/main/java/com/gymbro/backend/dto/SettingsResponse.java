package com.gymbro.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.gymbro.backend.enums.DistanceUnit;
import com.gymbro.backend.enums.WeightUnit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * The full settings payload: the API replaces the whole document instead of
 * patching single fields, matching how the client already writes preferences.
 *
 * <p>{@code unit}/{@code distanceUnit}/{@code muscleGroups} may be {@code null}
 * in a request, which means "leave this as it is" — the pragmatic PATCH-like
 * behaviour the settings form relies on.
 */
public record SettingsResponse(
        boolean showSetTime,
        List<String> muscleGroups,
        WeightUnit unit,
        DistanceUnit distanceUnit,
        WeightGoal weightGoal) {

    /** Body-weight goal driving the analytics burndown; {@code null} when unset. */
    public record WeightGoal(BigDecimal startLbs, LocalDate startDate,
            BigDecimal targetLbs, LocalDate targetDate) {
    }

    public record Request(
            boolean showSetTime,

            @Valid @Size(max = 50) List<@Size(min = 1, max = 50) String> muscleGroups,

            WeightUnit unit,

            DistanceUnit distanceUnit,

            @Valid WeightGoal weightGoal) {
    }
}
