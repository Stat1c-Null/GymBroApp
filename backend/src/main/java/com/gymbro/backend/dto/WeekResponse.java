package com.gymbro.backend.dto;

import java.time.LocalDate;
import java.util.List;

/** One week's log. {@code weekStart} is always the Monday of that week. */
public record WeekResponse(LocalDate weekStart, List<EntryResponse> entries) {
}
