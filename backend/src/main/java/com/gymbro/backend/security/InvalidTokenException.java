package com.gymbro.backend.security;

/** Thrown when a bearer token is malformed, tampered with or expired. */
public class InvalidTokenException extends RuntimeException {

    public InvalidTokenException(String message) {
        super(message);
    }
}
