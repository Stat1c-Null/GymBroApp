package com.gymbro.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.gymbro.backend.dto.ProfileResponse;
import com.gymbro.backend.enums.Relationship;
import com.gymbro.backend.model.User;

@Mapper(componentModel = "spring")
public interface ProfileMapper {

    /** Two sources: the person, plus how the caller relates to them. */
    @Mapping(target = "id", source = "user.id")
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "displayName", source = "user.displayName")
    @Mapping(target = "relationship", source = "relationship")
    ProfileResponse toResponse(User user, Relationship relationship);
}
