package com.gymbro.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gymbro.backend.dto.ExerciseRequest;
import com.gymbro.backend.dto.ExerciseResponse;
import com.gymbro.backend.security.AuthenticatedUser;
import com.gymbro.backend.service.ExerciseService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/exercises")
public class ExerciseController {

    private final ExerciseService exerciseService;

    public ExerciseController(ExerciseService exerciseService) {
        this.exerciseService = exerciseService;
    }

    @GetMapping
    public List<ExerciseResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) String muscleGroup) {
        return exerciseService.list(user.id(), muscleGroup);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExerciseResponse create(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody ExerciseRequest request) {
        return exerciseService.create(user.id(), request);
    }

    @PutMapping("/{id}")
    public ExerciseResponse update(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id, @Valid @RequestBody ExerciseRequest request) {
        return exerciseService.update(user.id(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        exerciseService.delete(user.id(), id);
    }
}
