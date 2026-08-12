package com.gymbro.backend.service.impl;

import java.util.Locale;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import com.gymbro.backend.dto.AuthResponse;
import com.gymbro.backend.dto.LoginRequest;
import com.gymbro.backend.dto.RegisterRequest;
import com.gymbro.backend.dto.UserResponse;
import com.gymbro.backend.exception.ApiException;
import com.gymbro.backend.mapper.UserMapper;
import com.gymbro.backend.metrics.AppMetrics;
import com.gymbro.backend.model.User;
import com.gymbro.backend.repository.UserRepository;
import com.gymbro.backend.security.JwtService;
import com.gymbro.backend.service.AuthService;
import com.gymbro.backend.service.SettingsService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SettingsService settingsService;
    private final UserMapper userMapper;
    private final AppMetrics metrics;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        String username = request.username().trim();

        User user = new User();
        user.setEmail(email);
        user.setUsername(username);
        user.setDisplayName(request.displayName() == null || request.displayName().isBlank()
                ? username
                : request.displayName().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));

        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("Email or username already exists");
        }

        // Same transaction: a user without settings is never visible.
        settingsService.createDefaults(user.getId());
        metrics.getRegistrations().increment();
        log.info("Registered user id={} username={}", user.getId(), username);

        return tokenFor(user);
    }

    @Override
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .orElseThrow(() -> ApiException.unauthorized("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw ApiException.unauthorized("Invalid email or password");
        }

        metrics.getLogins().increment();
        return tokenFor(user);
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse me(Long userId) {
        return userMapper.toResponse(userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found")));
    }

    private AuthResponse tokenFor(User user) {
        String token = jwtService.issue(user.getId(), user.getEmail(), user.getUsername());
        return AuthResponse.bearer(token, jwtService.ttlSeconds(), userMapper.toResponse(user));
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
