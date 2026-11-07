package com.gymbro.backend.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gymbro.backend.dto.SettingsResponse;
import com.gymbro.backend.enums.DistanceUnit;
import com.gymbro.backend.enums.WeightUnit;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.SettingsMapper;
import com.gymbro.backend.model.UserMuscleGroup;
import com.gymbro.backend.model.UserSettings;
import com.gymbro.backend.repository.UserMuscleGroupRepository;
import com.gymbro.backend.repository.UserSettingsRepository;
import com.gymbro.backend.service.ExerciseService;
import com.gymbro.backend.service.SettingsService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class SettingsServiceImpl implements SettingsService {

    private final UserSettingsRepository settingsRepository;
    private final UserMuscleGroupRepository muscleGroupRepository;
    private final ExerciseService exerciseService;
    private final SettingsMapper settingsMapper;

    @Override
    @Transactional
    public void createDefaults(Long userId) {
        UserSettings settings = new UserSettings();
        settings.setUserId(userId);
        settings.setUnit(WeightUnit.LBS);
        settings.setDistanceUnit(DistanceUnit.MI);
        settingsRepository.save(settings);
        writeGroups(userId, DEFAULT_MUSCLE_GROUPS);
    }

    @Override
    @Transactional(readOnly = true)
    public SettingsResponse get(Long userId) {
        UserSettings settings = settingsRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("Settings not found for this user"));
        return settingsMapper.toResponse(settings, readGroups(userId));
    }

    @Override
    @Transactional
    public SettingsResponse update(Long userId, SettingsResponse.Request request) {
        UserSettings settings = settingsRepository.findById(userId).orElseGet(() -> {
            UserSettings fresh = new UserSettings();
            fresh.setUserId(userId);
            return fresh;
        });

        settings.setShowSetTime(request.showSetTime());
        if (request.unit() != null) {
            settings.setUnit(request.unit());
        }
        if (request.distanceUnit() != null) {
            settings.setDistanceUnit(request.distanceUnit());
        }
        applyGoal(settings, request.weightGoal());
        settingsRepository.save(settings);

        List<String> groups = request.muscleGroups() != null
                ? replaceGroups(userId, request.muscleGroups())
                : readGroups(userId);

        return settingsMapper.toResponse(settings, groups);
    }

    private void applyGoal(UserSettings settings, SettingsResponse.WeightGoal goal) {
        if (goal == null) {
            settings.setGoalStartLbs(null);
            settings.setGoalStartDate(null);
            settings.setGoalTargetLbs(null);
            settings.setGoalTargetDate(null);
            return;
        }
        if (goal.targetLbs() == null || goal.targetDate() == null) {
            throw ApiException.badRequest("A weight goal needs both targetLbs and targetDate");
        }
        settings.setGoalStartLbs(goal.startLbs());
        settings.setGoalStartDate(goal.startDate());
        settings.setGoalTargetLbs(goal.targetLbs());
        settings.setGoalTargetDate(goal.targetDate());
    }

    /** Replaces the list, re-bucketing exercises whose group disappeared. */
    private List<String> replaceGroups(Long userId, List<String> requested) {
        List<String> cleaned = clean(requested);
        List<String> previous = readGroups(userId);

        Set<String> removed = new LinkedHashSet<>(previous);
        removed.removeAll(cleaned);
        removed.remove(UNASSIGNED_GROUP);
        for (String group : removed) {
            int moved = exerciseService.reassignMuscleGroup(userId, group, UNASSIGNED_GROUP);
            log.info("Moved {} exercise(s) from removed group '{}' to '{}'",
                    moved, group, UNASSIGNED_GROUP);
        }

        muscleGroupRepository.deleteByUserId(userId);
        // Flush before re-inserting: Hibernate runs inserts before deletes in a
        // single flush, which would collide with uq_muscle_groups_user_name.
        muscleGroupRepository.flush();
        writeGroups(userId, cleaned);
        return cleaned;
    }

    private List<String> clean(List<String> requested) {
        Set<String> unique = new LinkedHashSet<>();
        for (String raw : requested) {
            if (raw == null) {
                continue;
            }
            String name = raw.trim();
            if (name.isEmpty()) {
                throw ApiException.badRequest("Muscle group names must not be blank");
            }
            if (name.equalsIgnoreCase(UNASSIGNED_GROUP)) {
                throw ApiException.badRequest("'Unassigned' is a reserved muscle group name");
            }
            unique.add(name);
        }
        if (unique.isEmpty()) {
            throw ApiException.badRequest("At least one muscle group is required");
        }
        return new ArrayList<>(unique);
    }

    private void writeGroups(Long userId, List<String> groups) {
        List<UserMuscleGroup> rows = new ArrayList<>();
        for (int i = 0; i < groups.size(); i++) {
            rows.add(UserMuscleGroup.builder()
                    .userId(userId)
                    .name(groups.get(i))
                    .sortOrder(i)
                    .build());
        }
        muscleGroupRepository.saveAll(rows);
    }

    private List<String> readGroups(Long userId) {
        List<String> groups = muscleGroupRepository.findByUserIdOrderBySortOrderAsc(userId).stream()
                .map(UserMuscleGroup::getName)
                .toList();
        return groups.isEmpty() ? DEFAULT_MUSCLE_GROUPS : groups;
    }
}
