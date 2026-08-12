package com.gymbro.backend.service;

import java.util.List;

import com.gymbro.backend.dto.WeightRequest;
import com.gymbro.backend.dto.WeightResponse;

/** The body-weight log, newest first. */
public interface WeightService {

    int DEFAULT_LIMIT = 50;
    int MAX_LIMIT = 500;

    List<WeightResponse> list(Long userId, Integer limit);

    WeightResponse latest(Long userId);

    WeightResponse add(Long userId, WeightRequest request);

    void delete(Long userId, Long weightId);
}
