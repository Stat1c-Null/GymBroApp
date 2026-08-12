package com.gymbro.backend.mapper;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.gymbro.backend.dto.WeightResponse;
import com.gymbro.backend.model.BodyWeight;

@Mapper(componentModel = "spring")
public interface WeightMapper {

    BigDecimal LBS_PER_KG = new BigDecimal("2.2046226218");

    /**
     * Pounds are canonical, kilograms are derived on the way out so the two
     * numbers can never disagree.
     */
    @Mapping(target = "kg", expression = "java(toKg(weight.getWeightLbs()))")
    WeightResponse toResponse(BodyWeight weight);

    default BigDecimal toKg(BigDecimal lbs) {
        return lbs == null ? null : lbs.divide(LBS_PER_KG, 1, RoundingMode.HALF_UP);
    }
}
