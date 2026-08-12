package com.gymbro.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class WeekServiceTest {

    @Test
    void resolvesAnyDayToItsMonday() {
        assertThat(WeekService.mondayOf(LocalDate.of(2026, 10, 29))).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    void keepsAMondayAsItself() {
        assertThat(WeekService.mondayOf(LocalDate.of(2026, 10, 26))).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    void crossesMonthBoundaries() {
        assertThat(WeekService.mondayOf(LocalDate.of(2026, 11, 1))).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    void handlesSundayAsTheLastDayOfTheWeek() {
        assertThat(WeekService.mondayOf(LocalDate.of(2026, 11, 8))).isEqualTo(LocalDate.of(2026, 11, 2));
    }
}
