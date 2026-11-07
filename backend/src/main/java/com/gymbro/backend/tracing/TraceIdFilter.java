package com.gymbro.backend.tracing;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Accepts {@code X-Request-Id} from a gateway (or generates one), puts it into
 * the MDC so every log line of this request carries it, and echoes it back.
 *
 * <p>Runs before the security filters ({@code HIGHEST_PRECEDENCE}) so a rejected
 * request still gets a trace id in its logs.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String traceId = request.getHeader(TraceContext.HEADER);
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }

        // putCloseable restores the previous MDC state, so pooled threads never
        // leak one request's trace id into another.
        try (MDC.MDCCloseable ignored = MDC.putCloseable(TraceContext.MDC_KEY, traceId)) {
            response.setHeader(TraceContext.HEADER, traceId);
            filterChain.doFilter(request, response);
        }
    }
}
