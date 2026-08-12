package com.gymbro.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.gymbro.backend.model.Exercise;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {

    List<Exercise> findByUserIdOrderByNameAsc(Long userId);

    List<Exercise> findByUserIdAndMuscleGroupOrderByNameAsc(Long userId, String muscleGroup);

    Optional<Exercise> findByIdAndUserId(Long id, Long userId);

    /** Move every exercise of a removed muscle group into the fallback bucket. */
    @Modifying
    @Query("update Exercise e set e.muscleGroup = :to where e.userId = :userId and e.muscleGroup = :from")
    int reassignMuscleGroup(@Param("userId") Long userId, @Param("from") String from, @Param("to") String to);
}
