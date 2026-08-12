package com.gymbro.backend.service.impl;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gymbro.backend.dto.CardioDto;
import com.gymbro.backend.dto.EntryRequest;
import com.gymbro.backend.dto.EntryResponse;
import com.gymbro.backend.dto.SetDto;
import com.gymbro.backend.dto.WeekResponse;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.WeekMapper;
import com.gymbro.backend.metrics.AppMetrics;
import com.gymbro.backend.model.EntrySet;
import com.gymbro.backend.model.Exercise;
import com.gymbro.backend.model.WorkoutEntry;
import com.gymbro.backend.model.WorkoutWeek;
import com.gymbro.backend.repository.EntrySetRepository;
import com.gymbro.backend.repository.ExerciseRepository;
import com.gymbro.backend.repository.WorkoutEntryRepository;
import com.gymbro.backend.repository.WorkoutWeekRepository;
import com.gymbro.backend.service.WeekService;

import lombok.RequiredArgsConstructor;

/**
 * Entries and their sets are loaded in batches (three queries per request,
 * never one per row) and mapped to DTOs inside the transaction.
 */
@Service
@RequiredArgsConstructor
public class WeekServiceImpl implements WeekService {

    private final WorkoutWeekRepository weekRepository;
    private final WorkoutEntryRepository entryRepository;
    private final EntrySetRepository setRepository;
    private final ExerciseRepository exerciseRepository;
    private final WeekMapper weekMapper;
    private final AppMetrics metrics;

    @Override
    @Transactional(readOnly = true)
    public WeekResponse get(Long userId, LocalDate anyDayInWeek) {
        LocalDate weekStart = WeekService.mondayOf(anyDayInWeek);
        WorkoutWeek week = weekRepository.findByUserIdAndWeekStart(userId, weekStart).orElse(null);
        if (week == null) {
            return new WeekResponse(weekStart, List.of());
        }
        return weekMapper.toWeekResponse(week, entriesOf(List.of(week.getId()))
                .getOrDefault(week.getId(), List.of()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<WeekResponse> list(Long userId, LocalDate from, LocalDate to) {
        LocalDate toDate = to != null ? WeekService.mondayOf(to) : WeekService.mondayOf(LocalDate.now());
        LocalDate fromDate = from != null ? WeekService.mondayOf(from) : toDate.minusWeeks(DEFAULT_WEEKS - 1L);
        if (fromDate.isAfter(toDate)) {
            throw ApiException.badRequest("'from' must not be after 'to'");
        }

        List<WorkoutWeek> weeks = weekRepository
                .findByUserIdAndWeekStartBetweenOrderByWeekStartAsc(userId, fromDate, toDate);
        Map<Long, List<EntryResponse>> entriesByWeek = entriesOf(
                weeks.stream().map(WorkoutWeek::getId).toList());

        return weeks.stream()
                .sorted(Comparator.comparing(WorkoutWeek::getWeekStart).reversed())
                .map(week -> weekMapper.toWeekResponse(week,
                        entriesByWeek.getOrDefault(week.getId(), List.of())))
                .toList();
    }

    @Override
    @Transactional
    public EntryResponse addEntry(Long userId, LocalDate anyDayInWeek, EntryRequest request) {
        LocalDate weekStart = WeekService.mondayOf(anyDayInWeek);
        WorkoutWeek week = weekRepository.findByUserIdAndWeekStart(userId, weekStart)
                .orElseGet(() -> {
                    WorkoutWeek created = new WorkoutWeek();
                    created.setUserId(userId);
                    created.setWeekStart(weekStart);
                    return weekRepository.save(created);
                });

        WorkoutEntry entry = new WorkoutEntry();
        entry.setWeekId(week.getId());
        applyToEntry(userId, entry, request);
        entryRepository.save(entry);
        saveSets(entry.getId(), request);
        metrics.getLoggedEntries().increment();
        return toResponse(entry);
    }

    @Override
    @Transactional
    public EntryResponse updateEntry(Long userId, Long entryId, EntryRequest request) {
        WorkoutEntry entry = entryRepository.findOwned(entryId, userId)
                .orElseThrow(() -> ApiException.notFound("Entry not found"));

        applyToEntry(userId, entry, request);
        entryRepository.save(entry);

        setRepository.deleteByEntryId(entry.getId());
        setRepository.flush();
        saveSets(entry.getId(), request);

        return toResponse(entry);
    }

    @Override
    @Transactional
    public void deleteEntry(Long userId, Long entryId) {
        WorkoutEntry entry = entryRepository.findOwned(entryId, userId)
                .orElseThrow(() -> ApiException.notFound("Entry not found"));
        Long weekId = entry.getWeekId();

        entryRepository.delete(entry);
        entryRepository.flush();

        // A week exists only to hold entries: drop it once it is empty again.
        // Use optimistic locking: try to delete the week if empty.
        // If another transaction already deleted it, OptimisticLockingFailureException
        // will be caught by GlobalExceptionHandler and turned into 409.
        try {
            weekRepository.deleteEmptyWeekIfExists(weekId);
        } catch (OptimisticLockingFailureException ignored) {
            // Another transaction already deleted the week - that's fine.
        }
    }

    private void applyToEntry(Long userId, WorkoutEntry entry, EntryRequest request) {
        if (request.cardio() != null && request.sets() != null && !request.sets().isEmpty()) {
            throw ApiException.badRequest(
                    "An entry is either a strength exercise (sets) or cardio, not both");
        }

        entry.setDay(request.day().shortValue());

        String name = trimToNull(request.exerciseName());
        String muscleGroup = trimToNull(request.muscleGroup());
        Long exerciseId = request.exerciseId();

        entry.setExerciseId(exerciseId);

        if (exerciseId != null) {
            Exercise libraryExercise = exerciseRepository.findByIdAndUserId(exerciseId, userId)
                    .orElseThrow(() -> ApiException.badRequest("exerciseId does not belong to you"));
            entry.setExerciseId(libraryExercise.getId());
            if (name == null) {
                name = libraryExercise.getName();
            }
            if (muscleGroup == null) {
                muscleGroup = libraryExercise.getMuscleGroup();
            }
        } else if (name == null) {
            throw ApiException.badRequest("exerciseName is required when exerciseId is not given");
        }

        if (muscleGroup == null) {
            throw ApiException.badRequest("muscleGroup is required when exerciseId is not given");
        }

        entry.setExerciseName(name);
        entry.setMuscleGroup(muscleGroup);

        CardioDto cardio = request.cardio();
        if (cardio != null) {
            entry.setCardioTimeSec(cardio.timeSec());
            entry.setCardioDistanceMiles(cardio.distanceMiles());
            entry.setCardioHeartRate(cardio.heartRate());
            entry.setCardioElevationFeet(cardio.elevationFeet());
        } else {
            entry.setCardioTimeSec(null);
            entry.setCardioDistanceMiles(null);
            entry.setCardioHeartRate(null);
            entry.setCardioElevationFeet(null);
        }
    }

    private void saveSets(Long entryId, EntryRequest request) {
        if (request.cardio() != null || request.sets() == null || request.sets().isEmpty()) {
            return;
        }
        List<EntrySet> rows = new ArrayList<>();
        List<SetDto> sets = request.sets();
        for (int i = 0; i < sets.size(); i++) {
            SetDto set = sets.get(i);
            rows.add(EntrySet.builder()
                    .entryId(entryId)
                    .setIndex((short) i)
                    .reps(set.reps())
                    .weightLbs(set.weightLbs())
                    .timeSec(set.timeSec())
                    .build());
        }
        setRepository.saveAll(rows);
    }

    /** Entries and their sets for the given weeks, in two queries. */
    private Map<Long, List<EntryResponse>> entriesOf(List<Long> weekIds) {
        if (weekIds.isEmpty()) {
            return Map.of();
        }
        List<WorkoutEntry> entries = entryRepository.findByWeekIdInOrderByDayAscIdAsc(weekIds);
        Map<Long, List<SetDto>> setsByEntry = new LinkedHashMap<>();
        if (!entries.isEmpty()) {
            List<Long> entryIds = entries.stream().map(WorkoutEntry::getId).toList();
            for (EntrySet set : setRepository.findByEntryIdInOrderByEntryIdAscSetIndexAsc(entryIds)) {
                setsByEntry.computeIfAbsent(set.getEntryId(), key -> new ArrayList<>())
                        .add(weekMapper.toSetDto(set));
            }
        }

        Map<Long, List<EntryResponse>> byWeek = new LinkedHashMap<>();
        for (WorkoutEntry entry : entries) {
            byWeek.computeIfAbsent(entry.getWeekId(), key -> new ArrayList<>())
                    .add(weekMapper.toResponse(entry, setsByEntry.getOrDefault(entry.getId(), List.of())));
        }
        return byWeek;
    }

    private EntryResponse toResponse(WorkoutEntry entry) {
        List<SetDto> sets = setRepository.findByEntryIdOrderBySetIndexAsc(entry.getId()).stream()
                .map(weekMapper::toSetDto)
                .toList();
        return weekMapper.toResponse(entry, sets);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
