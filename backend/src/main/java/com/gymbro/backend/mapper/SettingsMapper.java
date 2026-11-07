package com.gymbro.backend.mapper;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.gymbro.backend.dto.SettingsResponse;
import com.gymbro.backend.model.UserSettings;

@Mapper(componentModel = "spring")
public interface SettingsMapper {

    /**
     * Settings live in two tables (row + ordered groups), so the mapper takes
     * both and the goal object is built by the default method below.
     */
    @Mapping(target = "muscleGroups", source = "groups")
    @Mapping(target = "weightGoal", source = "settings")
    SettingsResponse toResponse(UserSettings settings, List<String> groups);

    default SettingsResponse.WeightGoal toWeightGoal(UserSettings settings) {
        if (settings == null || settings.getGoalTargetLbs() == null) {
            return null;
        }
        return new SettingsResponse.WeightGoal(
                settings.getGoalStartLbs(),
                settings.getGoalStartDate(),
                settings.getGoalTargetLbs(),
                settings.getGoalTargetDate());
    }
}
