package com.gymbro.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.gymbro.backend.model.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    /**
     * Prefix search over username and display name, excluding the caller and
     * ordered so the list is stable across pages.
     */
    @Query("""
            select u from User u
            where u.id <> :userId
              and (lower(u.username) like lower(concat(:term, '%'))
                   or lower(coalesce(u.displayName, '')) like lower(concat(:term, '%')))
            order by lower(u.username)
            """)
    List<User> searchByPrefix(@Param("userId") Long userId, @Param("term") String term,
            Pageable pageable);
}
