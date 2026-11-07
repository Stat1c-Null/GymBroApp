package com.gymbro.backend.service;

import java.util.List;

import com.gymbro.backend.dto.FriendsResponse;
import com.gymbro.backend.dto.FriendshipResponse;
import com.gymbro.backend.dto.ProfileResponse;

/**
 * The friend graph: directory search, requests, acceptance and removal.
 *
 * <p>One row per relationship (never two mirrored rows), so accepting is a
 * single UPDATE that both users see immediately.
 */
public interface FriendService {

    /** Directory page: everyone (empty term) or username/name prefix matches. */
    List<ProfileResponse> search(Long userId, String term, Integer limit);

    FriendsResponse list(Long userId);

    FriendsResponse list(Long userId, int page, int size);

    FriendshipResponse sendRequest(Long userId, Long targetUserId);

    FriendshipResponse accept(Long userId, Long friendshipId);

    /** Refuses a pending request: the row is deleted, so either side may ask again. */
    void decline(Long userId, Long friendshipId);

    /** Removes an accepted friendship (or withdraws the caller's own pending request). */
    void remove(Long userId, Long friendshipId);
}
