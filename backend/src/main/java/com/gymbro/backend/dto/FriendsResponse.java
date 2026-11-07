package com.gymbro.backend.dto;

import java.util.List;

/** The three buckets the Friends page renders. */
public record FriendsResponse(List<FriendshipResponse> friends,
        List<FriendshipResponse> incoming,
        List<FriendshipResponse> outgoing) {
}
