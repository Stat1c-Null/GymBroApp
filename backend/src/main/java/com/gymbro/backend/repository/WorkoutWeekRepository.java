package com.gymbro.backend.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.gymbro.backend.model.WorkoutWeek;

public interface WorkoutWeekRepository extends JpaRepository<WorkoutWeek, Long> {

    Optional<WorkoutWeek> findByUserIdAndWeekStart(Long userId, LocalDate weekStart);

    List<WorkoutWeek> findByUserIdAndWeekStartBetweenOrderByWeekStartAsc(
            Long userId, LocalDate from, LocalDate to);

    List<WorkoutWeek> findByUserIdAndWeekStartGreaterThanEqualOrderByWeekStartAsc(
            Long userId, LocalDate from);

    /**
     * Deletes the week only if it has no entries. Uses a native query with
     * version check for optimistic locking.
     */
    @Modifying
    @Query("delete from WorkoutWeek w where w.id = :weekId and not exists (select 1 from WorkoutEntry e where e.weekId = w.id)")
    void deleteEmptyWeekIfExists(@Param("weekId") Long weekId);
}
