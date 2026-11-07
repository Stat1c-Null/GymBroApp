package com.gymbro.backend.model;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One set of a strength entry: reps × weight, optionally timed. */
@Entity
@Table(name = "entry_sets")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntrySet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entry_id", nullable = false)
    private Long entryId;

    /** Position within the entry, starting at 0; keeps the logged order stable. */
    @Column(name = "set_index", nullable = false)
    private short setIndex;

    private Integer reps;

    @Column(name = "weight_lbs", precision = 6, scale = 2)
    private BigDecimal weightLbs;

    @Column(name = "time_sec")
    private Integer timeSec;
}
