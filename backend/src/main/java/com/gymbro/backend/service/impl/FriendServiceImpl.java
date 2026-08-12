package com.gymbro.backend.service.impl;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gymbro.backend.dto.FriendsResponse;
import com.gymbro.backend.dto.FriendshipResponse;
import com.gymbro.backend.dto.ProfileResponse;
import com.gymbro.backend.enums.FriendshipStatus;
import com.gymbro.backend.enums.Relationship;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.FriendshipMapper;
import com.gymbro.backend.mapper.ProfileMapper;
import com.gymbro.backend.model.Friendship;
import com.gymbro.backend.repository.FriendshipRepository;
import com.gymbro.backend.repository.UserRepository;
import com.gymbro.backend.service.FriendService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class FriendServiceImpl implements FriendService {

    private static final int DEFAULT_RESULTS = 20;
    private static final int MAX_RESULTS = 100;

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final FriendshipMapper friendshipMapper;
    private final ProfileMapper profileMapper;

    @Override
    @Transactional(readOnly = true)
    public List<ProfileResponse> search(Long userId, String term, Integer limit) {
        int size = limit == null ? DEFAULT_RESULTS : Math.max(1, Math.min(limit, MAX_RESULTS));
        String needle = term == null ? "" : term.trim();

        Map<Long, Relationship> relationships = relationshipsByOtherUser(userId);

        return userRepository.searchByPrefix(userId, needle, PageRequest.of(0, size)).stream()
                .map(user -> profileMapper.toResponse(user,
                        relationships.getOrDefault(user.getId(), Relationship.NONE)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public FriendsResponse list(Long userId) {
        return list(userId, 0, 100); // default: first 100
    }

    @Override
    @Transactional(readOnly = true)
    public FriendsResponse list(Long userId, int page, int size) {
        int safeSize = Math.min(size, 100);
        Pageable pageable = PageRequest.of(page, safeSize);
        List<Friendship> friendships = friendshipRepository.findAllForUser(userId, pageable);

        List<FriendshipResponse> friends = new ArrayList<>();
        List<FriendshipResponse> incoming = new ArrayList<>();
        List<FriendshipResponse> outgoing = new ArrayList<>();

        for (Friendship friendship : friendships) {
            FriendshipResponse response = friendshipMapper.toResponse(friendship);
            switch (bucketOf(friendship, userId)) {
                case FRIEND -> friends.add(response);
                case INCOMING -> incoming.add(response);
                default -> outgoing.add(response);
            }
        }

        return new FriendsResponse(friends, incoming, outgoing);
    }

    @Override
    @Transactional
    public FriendshipResponse sendRequest(Long userId, Long targetUserId) {
        if (targetUserId == null || targetUserId.equals(userId)) {
            throw ApiException.badRequest("You cannot add yourself as a friend");
        }
        if (!userRepository.existsById(targetUserId)) {
            throw ApiException.notFound("User not found");
        }

        long low = Math.min(userId, targetUserId);
        long high = Math.max(userId, targetUserId);
        if (friendshipRepository.findByUserLowIdAndUserHighId(low, high).isPresent()) {
            throw ApiException.conflict("You already have a relationship with this user");
        }

        Friendship friendship = new Friendship();
        friendship.setRequesterId(userId);
        friendship.setAddresseeId(targetUserId);
        friendship.setUserLowId(low);
        friendship.setUserHighId(high);
        friendship.setStatus(FriendshipStatus.PENDING);

        return friendshipMapper.toResponse(friendshipRepository.save(friendship));
    }

    @Override
    @Transactional
    public FriendshipResponse accept(Long userId, Long friendshipId) {
        Friendship friendship = requireAddressee(userId, friendshipId);
        if (friendship.getStatus() == FriendshipStatus.ACCEPTED) {
            throw ApiException.conflict("This request has already been accepted");
        }
        friendship.setStatus(FriendshipStatus.ACCEPTED);
        friendship.setRespondedAt(OffsetDateTime.now());
        return friendshipMapper.toResponse(friendshipRepository.save(friendship));
    }

    @Override
    @Transactional
    public void decline(Long userId, Long friendshipId) {
        friendshipRepository.delete(requireAddressee(userId, friendshipId));
    }

    @Override
    @Transactional
    public void remove(Long userId, Long friendshipId) {
        Friendship friendship = requireParticipant(userId, friendshipId);
        if (friendship.getStatus() == FriendshipStatus.PENDING
                && !friendship.getRequesterId().equals(userId)) {
            throw ApiException.forbidden("Decline this request instead of removing it");
        }
        friendshipRepository.delete(friendship);
    }

    private Relationship bucketOf(Friendship friendship, Long userId) {
        if (friendship.getStatus() == FriendshipStatus.ACCEPTED) {
            return Relationship.FRIEND;
        }
        return friendship.getAddresseeId().equals(userId)
                ? Relationship.INCOMING
                : Relationship.OUTGOING;
    }

    private Friendship requireAddressee(Long userId, Long friendshipId) {
        Friendship friendship = requireParticipant(userId, friendshipId);
        if (!friendship.getAddresseeId().equals(userId)) {
            throw ApiException.forbidden("Only the person the request was sent to can answer it");
        }
        return friendship;
    }

    private Friendship requireParticipant(Long userId, Long friendshipId) {
        Friendship friendship = friendshipRepository.findById(friendshipId)
                .orElseThrow(() -> ApiException.notFound("Friendship not found"));
        if (!friendship.getRequesterId().equals(userId) && !friendship.getAddresseeId().equals(userId)) {
            // Same answer as "missing" so ids cannot be probed.
            throw ApiException.notFound("Friendship not found");
        }
        return friendship;
    }

    /** other-user id → how the caller relates to them. */
    private Map<Long, Relationship> relationshipsByOtherUser(Long userId) {
        Map<Long, Relationship> relationships = new HashMap<>();
        int page = 0;
        int size = 100;
        List<Friendship> pageResult;
        do {
            Pageable pageable = PageRequest.of(page, size);
            pageResult = friendshipRepository.findAllForUser(userId, pageable);
            for (Friendship friendship : pageResult) {
                Long other = friendship.getRequesterId().equals(userId)
                        ? friendship.getAddresseeId()
                        : friendship.getRequesterId();
                relationships.put(other, bucketOf(friendship, userId));
            }
            page++;
        } while (pageResult.size() == size);
        return relationships;
    }
}
