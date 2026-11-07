package com.gymbro.backend.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One body-weight measurement (pounds). */
@Entity
@Table(name = "body_weights")
@Getter
@Setter
@NoArgsConstructor
public class BodyWeight {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "weight_lbs", nullable = false, precision = 6, scale = 2)
    private BigDecimal weightLbs;

    /** When the user weighed in; defaults to "now" when the client omits it. */
    @Column(name = "logged_at", nullable = false)
    private OffsetDateTime loggedAt;
}
