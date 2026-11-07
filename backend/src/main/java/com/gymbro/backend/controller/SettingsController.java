package com.gymbro.backend.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.gymbro.backend.dto.SettingsResponse;
import com.gymbro.backend.security.AuthenticatedUser;
import com.gymbro.backend.service.SettingsService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public SettingsResponse get(@AuthenticationPrincipal AuthenticatedUser user) {
        return settingsService.get(user.id());
    }

    /** Full replacement — the client always sends every preference it knows about. */
    @PutMapping
    public SettingsResponse update(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody SettingsResponse.Request request) {
        return settingsService.update(user.id(), request);
    }
}
