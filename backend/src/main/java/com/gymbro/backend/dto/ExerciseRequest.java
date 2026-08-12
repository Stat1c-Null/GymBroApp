package com.gymbro.backend.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** Body for creating or fully replacing an exercise-library entry. */
public record ExerciseRequest(

        @NotBlank @Size(max = 100) String name,

        @NotBlank @Size(max = 50) String muscleGroup,

        @PositiveOrZero BigDecimal usualWeightLbs,

        @PositiveOrZero BigDecimal maxWeightLbs) {
}
