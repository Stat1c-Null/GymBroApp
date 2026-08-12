package com.gymbro.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.gymbro.backend.model.WorkoutEntry;

public interface WorkoutEntryRepository extends JpaRepository<WorkoutEntry, Long> {

    List<WorkoutEntry> findByWeekIdOrderByDayAscIdAsc(Long weekId);

    List<WorkoutEntry> findByWeekIdInOrderByDayAscIdAsc(Collection<Long> weekIds);

    long countByWeekId(Long weekId);

    /**
     * Loads an entry only if it belongs to {@code userId}. Ownership goes through
     * the parent week, which is what stops one user from editing another's log by
     * guessing an entry id.
     */
    @Query("""
            select e from WorkoutEntry e
            join WorkoutWeek w on w.id = e.weekId
            where e.id = :entryId and w.userId = :userId
            """)
    Optional<WorkoutEntry> findOwned(@Param("entryId") Long entryId, @Param("userId") Long userId);
}
