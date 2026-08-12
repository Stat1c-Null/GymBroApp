package com.gymbro.backend.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One exercise logged inside a week. Either a strength exercise (with rows in
 * {@code entry_sets}) or one cardio session (with the {@code cardio*} columns);
 * cardio entries have no sets.
 *
 * <p>{@code exerciseName}/{@code muscleGroup} are copies of the library values
 * on purpose: the log must still read correctly after the library entry is
 * renamed or deleted, which is also why {@code exerciseId} is nullable.
 */
@Entity
@Table(name = "workout_entries")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "week_id", nullable = false)
    private Long weekId;

    /** 0 = Monday … 6 = Sunday. Column is {@code day_of_week} — {@code DAY} is a reserved word in H2/SQL. */
    @Column(name = "day_of_week", nullable = false)
    private short day;

    @Column(name = "exercise_id")
    private Long exerciseId;

    @Column(name = "exercise_name", nullable = false, length = 100)
    private String exerciseName;

    @Column(name = "muscle_group", nullable = false, length = 50)
    private String muscleGroup;

    @Column(name = "cardio_time_sec")
    private Integer cardioTimeSec;

    @Column(name = "cardio_distance_miles", precision = 8, scale = 3)
    private BigDecimal cardioDistanceMiles;

    @Column(name = "cardio_heart_rate")
    private Integer cardioHeartRate;

    @Column(name = "cardio_elevation_feet", precision = 8, scale = 2)
    private BigDecimal cardioElevationFeet;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /** Optimistic lock for concurrent edits of the same logged entry. */
    @Version
    @Column(nullable = false)
    private Long version;

    /** True when this entry carries cardio data rather than sets. */
    public boolean isCardio() {
        return cardioTimeSec != null || cardioDistanceMiles != null
                || cardioHeartRate != null || cardioElevationFeet != null;
    }
}
