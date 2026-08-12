package com.gymbro.backend.service;

import com.gymbro.backend.dto.AuthResponse;
import com.gymbro.backend.dto.LoginRequest;
import com.gymbro.backend.dto.RegisterRequest;
import com.gymbro.backend.dto.UserResponse;

/** Registration, login and "who am I" — the only operations reachable without a token. */
public interface AuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

    UserResponse me(Long userId);
}
