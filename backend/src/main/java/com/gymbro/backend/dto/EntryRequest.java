package com.gymbro.backend.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body for logging (or editing) one entry in a week.
 *
 * <p>{@code exerciseId} is optional and only used to link back to the library;
 * when {@code exerciseName}/{@code muscleGroup} are omitted they are copied from
 * that library entry, otherwise the supplied (denormalized) values win so a log
 * can survive the library entry being renamed or deleted.
 */
public record EntryRequest(

        @NotNull @Min(0) @Max(6) Integer day,

        Long exerciseId,

        @Size(max = 100) String exerciseName,

        @Size(max = 50) String muscleGroup,

        @Valid List<SetDto> sets,

        @Valid CardioDto cardio) {
}
