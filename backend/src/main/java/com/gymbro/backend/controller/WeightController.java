package com.gymbro.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gymbro.backend.dto.WeightRequest;
import com.gymbro.backend.dto.WeightResponse;
import com.gymbro.backend.security.AuthenticatedUser;
import com.gymbro.backend.service.WeightService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/weights")
public class WeightController {

    private final WeightService weightService;

    public WeightController(WeightService weightService) {
        this.weightService = weightService;
    }

    @GetMapping
    public List<WeightResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) Integer limit) {
        return weightService.list(user.id(), limit);
    }

    @GetMapping("/latest")
    public WeightResponse latest(@AuthenticationPrincipal AuthenticatedUser user) {
        return weightService.latest(user.id());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WeightResponse add(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody WeightRequest request) {
        return weightService.add(user.id(), request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        weightService.delete(user.id(), id);
    }
}
