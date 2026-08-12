package com.gymbro.backend.service;

import java.util.List;

import com.gymbro.backend.dto.ExerciseRequest;
import com.gymbro.backend.dto.ExerciseResponse;

/** The user's exercise library ("what I train"), scoped per user. */
public interface ExerciseService {

    List<ExerciseResponse> list(Long userId, String muscleGroup);

    ExerciseResponse create(Long userId, ExerciseRequest request);

    ExerciseResponse update(Long userId, Long exerciseId, ExerciseRequest request);

    void delete(Long userId, Long exerciseId);

    /**
     * Reassigns all exercises of a deleted muscle group to the Unassigned bucket.
     * Called from SettingsService when user removes a muscle group.
     */
    int reassignMuscleGroup(Long userId, String fromGroup, String toGroup);
}
