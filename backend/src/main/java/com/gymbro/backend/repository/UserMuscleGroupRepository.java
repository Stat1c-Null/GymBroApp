package com.gymbro.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.gymbro.backend.model.UserMuscleGroup;

public interface UserMuscleGroupRepository extends JpaRepository<UserMuscleGroup, Long> {

    List<UserMuscleGroup> findByUserIdOrderBySortOrderAsc(Long userId);

    void deleteByUserId(Long userId);
}
