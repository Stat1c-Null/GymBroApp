package com.gymbro.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record ExerciseResponse(Long id, String name, String muscleGroup,
        BigDecimal usualWeightLbs, BigDecimal maxWeightLbs, OffsetDateTime createdAt) {
}
