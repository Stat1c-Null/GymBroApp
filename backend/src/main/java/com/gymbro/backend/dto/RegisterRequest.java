package com.gymbro.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(

        @NotBlank @Email @Size(max = 255) String email,

        @NotBlank @Size(min = 3, max = 50)
        @Pattern(regexp = "[A-Za-z0-9._-]+",
                message = "username may contain letters, digits, dots, underscores and dashes only")
        String username,

        @NotBlank @Size(min = 8, max = 72) String password,

        @Size(max = 100) String displayName) {
}
