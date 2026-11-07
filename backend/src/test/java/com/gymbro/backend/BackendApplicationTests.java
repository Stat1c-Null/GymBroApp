package com.gymbro.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Boots the whole application (web layer, security, JPA and Liquibase) against
 * the in-memory {@code dev} database, which also proves the changelogs apply
 * cleanly and match the entity mappings ({@code ddl-auto: validate}).
 */
@SpringBootTest
@ActiveProfiles("dev")
class BackendApplicationTests {

    @Test
    void contextLoads() {
    }
}
