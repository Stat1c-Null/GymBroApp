package com.gymbro.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The same application against a <em>real</em> PostgreSQL in Docker instead of
 * H2. This is what proves the Liquibase changelogs and the entity mappings are
 * actually Postgres-compatible — H2's PostgreSQL mode is only an approximation.
 *
 * <p>Skipped automatically when Docker is not available, so a laptop without
 * Docker still runs {@code mvn test} green.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PostgresApiIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Value("${local.server.port}")
    private int port;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void migrationsAndTheMainFlowWorkOnPostgreSQL() throws Exception {
        HttpResponse<String> registered = post("/api/v1/auth/register", null, """
                {"email":"pg@example.com","username":"pguser","password":"secret123"}
                """);
        assertThat(registered.statusCode()).isEqualTo(201);
        String token = json.readTree(registered.body()).path("token").asString();

        HttpResponse<String> created = post("/api/v1/exercises", token, """
                {"name":"Squat","muscleGroup":"Legs","usualWeightLbs":225.0}
                """);
        assertThat(created.statusCode()).isEqualTo(201);
        long exerciseId = json.readTree(created.body()).path("id").asLong();

        HttpResponse<String> entry = post("/api/v1/weeks/2026-11-05/entries", token, """
                {"day":3,"exerciseId":%d,"sets":[{"reps":5,"weightLbs":225.0}]}
                """.formatted(exerciseId));
        assertThat(entry.statusCode()).isEqualTo(201);

        HttpResponse<String> week = get("/api/v1/weeks/2026-11-02", token);
        assertThat(week.statusCode()).isEqualTo(200);
        JsonNode body = json.readTree(week.body());
        assertThat(body.path("weekStart").asString()).isEqualTo("2026-11-02");
        assertThat(body.path("entries")).hasSize(1);

        // Enum persisted as a name, exposed as the client's short code.
        HttpResponse<String> settings = put("/api/v1/settings", token, """
                {"showSetTime":true,"unit":"kg","distanceUnit":"km",
                 "muscleGroups":["Legs","Chest"]}
                """);
        assertThat(settings.statusCode()).isEqualTo(200);
        assertThat(json.readTree(settings.body()).path("unit").asString()).isEqualTo("kg");
    }

    private HttpResponse<String> post(String path, String token, String body) throws Exception {
        return send("POST", path, token, body);
    }

    private HttpResponse<String> put(String path, String token, String body) throws Exception {
        return send("PUT", path, token, body);
    }

    private HttpResponse<String> get(String path, String token) throws Exception {
        return send("GET", path, token, null);
    }

    private HttpResponse<String> send(String method, String path, String token, String body)
            throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        builder.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
