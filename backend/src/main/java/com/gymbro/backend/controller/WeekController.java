package com.gymbro.backend.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
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

import com.gymbro.backend.dto.EntryRequest;
import com.gymbro.backend.dto.EntryResponse;
import com.gymbro.backend.dto.WeekResponse;
import com.gymbro.backend.security.AuthenticatedUser;
import com.gymbro.backend.service.WeekService;

import jakarta.validation.Valid;

/**
 * Weekly logs. A week is addressed by any date inside it ({@code /api/v1/weeks/2026-10-29});
 * the server normalizes to that week's Monday.
 */
@RestController
@RequestMapping("/api/v1")
public class WeekController {

    private final WeekService weekService;

    public WeekController(WeekService weekService) {
        this.weekService = weekService;
    }

    @GetMapping("/weeks")
    public List<WeekResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return weekService.list(user.id(), from, to);
    }

    @GetMapping("/weeks/{date}")
    public WeekResponse get(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return weekService.get(user.id(), date);
    }

    @PostMapping("/weeks/{date}/entries")
    @ResponseStatus(HttpStatus.CREATED)
    public EntryResponse addEntry(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @Valid @RequestBody EntryRequest request) {
        return weekService.addEntry(user.id(), date, request);
    }

    @PutMapping("/entries/{id}")
    public EntryResponse updateEntry(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id, @Valid @RequestBody EntryRequest request) {
        return weekService.updateEntry(user.id(), id, request);
    }

    @DeleteMapping("/entries/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEntry(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        weekService.deleteEntry(user.id(), id);
    }
}
