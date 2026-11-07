package com.gymbro.backend.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.PositiveOrZero;

/** A single cardio session (one per day, no per-set breakdown). */
public record CardioDto(

        @PositiveOrZero Integer timeSec,

        @PositiveOrZero BigDecimal distanceMiles,

        @PositiveOrZero @Max(300) Integer heartRate,

        @PositiveOrZero BigDecimal elevationFeet) {
}
