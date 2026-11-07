package com.gymbro.backend.tracing;

/** Header and MDC key used to correlate one request across services and logs. */
public final class TraceContext {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "traceId";

    private TraceContext() {
    }
}
