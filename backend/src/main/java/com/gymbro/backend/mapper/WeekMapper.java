package com.gymbro.backend.mapper;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.gymbro.backend.dto.CardioDto;
import com.gymbro.backend.dto.EntryResponse;
import com.gymbro.backend.dto.SetDto;
import com.gymbro.backend.dto.WeekResponse;
import com.gymbro.backend.model.EntrySet;
import com.gymbro.backend.model.WorkoutEntry;
import com.gymbro.backend.model.WorkoutWeek;

@Mapper(componentModel = "spring")
public interface WeekMapper {

    /** A logged entry plus its already-loaded sets (no lazy loading here). */
    @Mapping(target = "sets", source = "sets")
    @Mapping(target = "cardio", expression = "java(toCardio(entry))")
    EntryResponse toResponse(WorkoutEntry entry, List<SetDto> sets);

    SetDto toSetDto(EntrySet set);

    @Mapping(target = "weekStart", source = "week.weekStart")
    @Mapping(target = "entries", source = "entries")
    WeekResponse toWeekResponse(WorkoutWeek week, List<EntryResponse> entries);

    /** Cardio fields live flat on the entry; the API exposes them as an object. */
    default CardioDto toCardio(WorkoutEntry entry) {
        if (!entry.isCardio()) {
            return null;
        }
        return new CardioDto(entry.getCardioTimeSec(), entry.getCardioDistanceMiles(),
                entry.getCardioHeartRate(), entry.getCardioElevationFeet());
    }
}
