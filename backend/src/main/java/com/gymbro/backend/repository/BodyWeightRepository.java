package com.gymbro.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.gymbro.backend.model.BodyWeight;

public interface BodyWeightRepository extends JpaRepository<BodyWeight, Long> {

    List<BodyWeight> findByUserIdOrderByLoggedAtDesc(Long userId, Pageable pageable);

    Optional<BodyWeight> findByIdAndUserId(Long id, Long userId);
}
