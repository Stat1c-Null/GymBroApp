package com.gymbro.backend.metrics;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.Getter;

/**
 * Domain counters, the same idea as {@code FileMetrics} in the microservices
 * project: business events next to the technical HTTP/JVM metrics that
 * Actuator already exposes.
 */
@Component
@Getter
public class AppMetrics {

    private final Counter registrations;
    private final Counter logins;
    private final Counter loggedEntries;
    private final Counter weighIns;

    public AppMetrics(MeterRegistry registry) {
        this.registrations = Counter.builder("gymbro.registrations")
                .description("New accounts created")
                .register(registry);
        this.logins = Counter.builder("gymbro.logins")
                .description("Successful sign-ins")
                .register(registry);
        this.loggedEntries = Counter.builder("gymbro.entries.logged")
                .description("Workout entries logged")
                .register(registry);
        this.weighIns = Counter.builder("gymbro.weigh_ins")
                .description("Body-weight measurements recorded")
                .register(registry);
    }
}
