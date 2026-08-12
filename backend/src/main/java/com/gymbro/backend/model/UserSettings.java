package com.gymbro.backend.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import org.hibernate.annotations.UpdateTimestamp;

import com.gymbro.backend.enums.DistanceUnit;
import com.gymbro.backend.enums.WeightUnit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Per-user preferences. The primary key <em>is</em> the user id, so a row of
 * settings cannot exist without its owner and no surrogate id is needed.
 *
 * <p>{@code unit}/{@code distanceUnit} only affect display; stored weights are
 * always pounds and distances always miles.
 */
@Entity
@Table(name = "user_settings")
@Getter
@Setter
@NoArgsConstructor
public class UserSettings {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "show_set_time", nullable = false)
    private boolean showSetTime;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private WeightUnit unit = WeightUnit.LBS;

    @Enumerated(EnumType.STRING)
    @Column(name = "distance_unit", nullable = false, length = 8)
    private DistanceUnit distanceUnit = DistanceUnit.MI;

    @Column(name = "goal_start_lbs", precision = 6, scale = 2)
    private BigDecimal goalStartLbs;

    @Column(name = "goal_start_date")
    private LocalDate goalStartDate;

    @Column(name = "goal_target_lbs", precision = 6, scale = 2)
    private BigDecimal goalTargetLbs;

    @Column(name = "goal_target_date")
    private LocalDate goalTargetDate;

    @Column(name = "entries_backfilled_at")
    private OffsetDateTime entriesBackfilledAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * Optimistic lock: two concurrent PUTs both load version N, the first
     * commits N+1, the second fails with 409 instead of silently overwriting
     * the other one's changes.
     */
    @Version
    @Column(nullable = false)
    private Long version;
}
