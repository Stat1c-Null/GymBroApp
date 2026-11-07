package com.gymbro.backend.service.impl;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gymbro.backend.dto.WeightRequest;
import com.gymbro.backend.dto.WeightResponse;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.WeightMapper;
import com.gymbro.backend.metrics.AppMetrics;
import com.gymbro.backend.model.BodyWeight;
import com.gymbro.backend.repository.BodyWeightRepository;
import com.gymbro.backend.service.WeightService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class WeightServiceImpl implements WeightService {

    private final BodyWeightRepository weightRepository;
    private final WeightMapper weightMapper;
    private final AppMetrics metrics;

    @Override
    @Transactional(readOnly = true)
    public List<WeightResponse> list(Long userId, Integer limit) {
        // Never trust a client-supplied page size.
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        return weightRepository
                .findByUserIdOrderByLoggedAtDesc(userId, PageRequest.of(0, size))
                .stream()
                .map(weightMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public WeightResponse latest(Long userId) {
        return weightRepository.findByUserIdOrderByLoggedAtDesc(userId, PageRequest.of(0, 1))
                .stream()
                .findFirst()
                .map(weightMapper::toResponse)
                .orElseThrow(() -> ApiException.notFound("No weigh-ins logged yet"));
    }

    @Override
    @Transactional
    public WeightResponse add(Long userId, WeightRequest request) {
        BodyWeight weight = new BodyWeight();
        weight.setUserId(userId);
        weight.setWeightLbs(request.weightLbs());
        weight.setLoggedAt(request.loggedAt() == null ? OffsetDateTime.now() : request.loggedAt());
        metrics.getWeighIns().increment();
        return weightMapper.toResponse(weightRepository.save(weight));
    }

    @Override
    @Transactional
    public void delete(Long userId, Long weightId) {
        BodyWeight weight = weightRepository.findByIdAndUserId(weightId, userId)
                .orElseThrow(() -> ApiException.notFound("Weigh-in not found"));
        weightRepository.delete(weight);
    }
}
