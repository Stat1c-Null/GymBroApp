package com.gymbro.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.gymbro.backend.model.Friendship;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    Optional<Friendship> findByUserLowIdAndUserHighId(Long userLowId, Long userHighId);

    /** Every relationship the user is part of, in either role. */
    @Query("""
            select f from Friendship f
            where f.requesterId = :userId or f.addresseeId = :userId
            order by f.createdAt desc
            """)
    List<Friendship> findAllForUser(@Param("userId") Long userId, Pageable pageable);

    /** Count all friendships for a user (for pagination metadata). */
    @Query("""
            select count(f) from Friendship f
            where f.requesterId = :userId or f.addresseeId = :userId
            """)
    long countAllForUser(@Param("userId") Long userId);
}
