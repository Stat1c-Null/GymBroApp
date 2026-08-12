package com.gymbro.backend.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import com.gymbro.backend.dto.EntryRequest;
import com.gymbro.backend.dto.EntryResponse;
import com.gymbro.backend.dto.WeekResponse;

/**
 * Weekly logs: a week is addressed by any date inside it and always normalized
 * to its Monday, so the client never has to compute the start of the week.
 */
public interface WeekService {

    /** How far back {@link #list} looks when the caller gives no range. */
    int DEFAULT_WEEKS = 8;

    /** The Monday of the week containing {@code date}. */
    static LocalDate mondayOf(LocalDate date) {
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    /** A week that has nothing logged yet comes back with an empty entry list. */
    WeekResponse get(Long userId, LocalDate anyDayInWeek);

    /** Weeks overlapping {@code from..to}, newest first. Defaults to the last 8 weeks. */
    List<WeekResponse> list(Long userId, LocalDate from, LocalDate to);

    EntryResponse addEntry(Long userId, LocalDate anyDayInWeek, EntryRequest request);

    EntryResponse updateEntry(Long userId, Long entryId, EntryRequest request);

    void deleteEntry(Long userId, Long entryId);
}
