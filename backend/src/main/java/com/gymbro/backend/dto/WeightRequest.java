package com.gymbro.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * A weigh-in. Pounds are canonical; {@code loggedAt} defaults to now when the
 * client leaves it out.
 */
public record WeightRequest(

        @NotNull @Positive BigDecimal weightLbs,

        OffsetDateTime loggedAt) {
}
