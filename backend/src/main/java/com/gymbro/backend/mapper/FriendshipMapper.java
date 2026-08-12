package com.gymbro.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.gymbro.backend.dto.FriendshipResponse;
import com.gymbro.backend.model.Friendship;

@Mapper(componentModel = "spring")
public interface FriendshipMapper {

    /** {@code members} mirrors the shape the Angular client already expects. */
    @Mapping(target = "members",
            expression = "java(java.util.List.of(friendship.getRequesterId(), friendship.getAddresseeId()))")
    FriendshipResponse toResponse(Friendship friendship);
}
