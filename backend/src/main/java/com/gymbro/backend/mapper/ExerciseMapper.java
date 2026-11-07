package com.gymbro.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;

import com.gymbro.backend.dto.ExerciseRequest;
import com.gymbro.backend.dto.ExerciseResponse;
import com.gymbro.backend.model.Exercise;

@Mapper(componentModel = "spring")
public interface ExerciseMapper {

    ExerciseResponse toResponse(Exercise exercise);

    /**
     * Copies the request onto a managed entity. MapStruct writes the setters for
     * us, so adding a field to the DTO fails the build until the entity has it
     * too — exactly the safety net hand-written mappers lack.
     */
    void updateEntity(ExerciseRequest request, @MappingTarget Exercise exercise);
}
