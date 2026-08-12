package com.gymbro.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * A weigh-in in both units, so the client can render whichever the user picked
 * without converting (the same reason the Firestore documents stored both).
 */
public record WeightResponse(Long id, BigDecimal lbs, BigDecimal kg, OffsetDateTime loggedAt) {
}
