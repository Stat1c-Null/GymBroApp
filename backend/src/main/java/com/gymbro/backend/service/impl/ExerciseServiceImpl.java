package com.gymbro.backend.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gymbro.backend.dto.ExerciseRequest;
import com.gymbro.backend.dto.ExerciseResponse;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.ExerciseMapper;
import com.gymbro.backend.model.Exercise;
import com.gymbro.backend.repository.ExerciseRepository;
import com.gymbro.backend.service.ExerciseService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ExerciseServiceImpl implements ExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final ExerciseMapper exerciseMapper;

    @Override
    @Transactional(readOnly = true)
    public List<ExerciseResponse> list(Long userId, String muscleGroup) {
        List<Exercise> exercises = muscleGroup == null || muscleGroup.isBlank()
                ? exerciseRepository.findByUserIdOrderByNameAsc(userId)
                : exerciseRepository.findByUserIdAndMuscleGroupOrderByNameAsc(userId, muscleGroup.trim());
        return exercises.stream().map(exerciseMapper::toResponse).toList();
    }

    @Override
    @Transactional
    public ExerciseResponse create(Long userId, ExerciseRequest request) {
        Exercise exercise = new Exercise();
        exercise.setUserId(userId);
        exerciseMapper.updateEntity(request, exercise);
        return exerciseMapper.toResponse(exerciseRepository.save(exercise));
    }

    @Override
    @Transactional
    public ExerciseResponse update(Long userId, Long exerciseId, ExerciseRequest request) {
        Exercise exercise = requireOwned(userId, exerciseId);
        exerciseMapper.updateEntity(request, exercise);
        return exerciseMapper.toResponse(exerciseRepository.save(exercise));
    }

    @Override
    @Transactional
    public void delete(Long userId, Long exerciseId) {
        exerciseRepository.delete(requireOwned(userId, exerciseId));
    }

    private Exercise requireOwned(Long userId, Long exerciseId) {
        return exerciseRepository.findByIdAndUserId(exerciseId, userId)
                .orElseThrow(() -> ApiException.notFound("Exercise not found"));
    }

    @Override
    @Transactional
    public int reassignMuscleGroup(Long userId, String fromGroup, String toGroup) {
        return exerciseRepository.reassignMuscleGroup(userId, fromGroup, toGroup);
    }
}
