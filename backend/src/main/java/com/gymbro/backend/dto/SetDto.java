package com.gymbro.backend.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;

/** One logged set. Any field may be null (bodyweight sets have no weight). */
public record SetDto(

        @PositiveOrZero Integer reps,

        @PositiveOrZero BigDecimal weightLbs,

        @PositiveOrZero Integer timeSec) {
}
