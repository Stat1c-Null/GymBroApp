package com.gymbro.backend.dto;

import java.util.List;

public record EntryResponse(Long id, int day, Long exerciseId, String exerciseName,
        String muscleGroup, List<SetDto> sets, CardioDto cardio) {
}
