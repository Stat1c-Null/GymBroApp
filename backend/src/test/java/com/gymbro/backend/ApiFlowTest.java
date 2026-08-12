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
import org.springframework.test.context.ActiveProfiles;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * End-to-end HTTP test of the whole API against the in-memory dev database:
 * register → sign in → build an exercise library → log a week → read it back,
 * plus the authorization and re-bucketing rules.
 *
 * <p>Uses the JDK HTTP client rather than MockMvc so the real filter chain,
 * serialization and status codes are exercised over a real socket.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
class ApiFlowTest {

    @Value("${local.server.port}")
    private int port;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final JsonMapper json = JsonMapper.builder().build();

    private record Reply(int status, JsonNode body) {

        String text(String field) {
            return body == null ? null : body.path(field).asString(null);
        }

        long number(String field) {
            return body == null ? -1 : body.path(field).asLong(-1);
        }
    }

    @Test
    void aUserCanRegisterLogAWorkoutAndManageSettings() throws Exception {
        // --- registration -------------------------------------------------
        Reply registered = call("POST", "/api/v1/auth/register", null, """
                {"email":"flow@example.com","username":"flowuser","password":"secret123","displayName":"Flow"}
                """);
        assertThat(registered.status).isEqualTo(201);
        String token = registered.text("token");
        assertThat(token).isNotBlank();
        assertThat(registered.body.path("user").path("username").asString()).isEqualTo("flowuser");

        // --- authentication is actually enforced --------------------------
        assertThat(call("GET", "/api/v1/exercises", null, null).status).isEqualTo(401);
        assertThat(call("GET", "/api/v1/auth/me", token, null).number("id")).isPositive();

        // --- the library starts empty, settings have the defaults ---------
        assertThat(call("GET", "/api/v1/exercises", token, null).body.isArray()).isTrue();
        JsonNode settings = call("GET", "/api/v1/settings", token, null).body;
        assertThat(settings.path("unit").asString()).isEqualTo("lbs");
        assertThat(settings.path("muscleGroups")).hasSize(6);

        // --- create a library exercise and log a session ------------------
        Reply created = call("POST", "/api/v1/exercises", token, """
                {"name":"Bench Press","muscleGroup":"Chest","usualWeightLbs":180.0,"maxWeightLbs":225.0}
                """);
        assertThat(created.status).isEqualTo(201);
        long exerciseId = created.number("id");

        Reply entry = call("POST", "/api/v1/weeks/2026-10-29/entries", token, """
                {"day":0,"exerciseId":%d,"sets":[
                    {"reps":5,"weightLbs":185.0},
                    {"reps":5,"weightLbs":185.0,"timeSec":40}
                ]}
                """.formatted(exerciseId));
        assertThat(entry.status).isEqualTo(201);
        assertThat(entry.body.path("exerciseName").asString()).isEqualTo("Bench Press");
        assertThat(entry.body.path("muscleGroup").asString()).isEqualTo("Chest");
        assertThat(entry.body.path("sets")).hasSize(2);
        long entryId = entry.number("id");

        // Any day of the week resolves to the same Monday-based week.
        Reply week = call("GET", "/api/v1/weeks/2026-10-27", token, null);
        assertThat(week.body.path("weekStart").asString()).isEqualTo("2026-10-26");
        assertThat(week.body.path("entries")).hasSize(1);
        assertThat(call("GET", "/api/v1/weeks/2026-10-19", token, null).body.path("entries")).isEmpty();

        // --- editing and deleting ----------------------------------------
        Reply edited = call("PUT", "/api/v1/entries/" + entryId, token, """
                {"day":1,"exerciseId":%d,"sets":[{"reps":8,"weightLbs":155.0}]}
                """.formatted(exerciseId));
        assertThat(edited.body.path("day").asInt()).isEqualTo(1);
        assertThat(edited.body.path("sets")).hasSize(1);

        // --- body weight, in both units -----------------------------------
        Reply weight = call("POST", "/api/v1/weights", token, """
                {"weightLbs":180.0}
                """);
        assertThat(weight.status).isEqualTo(201);
        assertThat(weight.body.path("kg").asDouble()).isEqualTo(81.6);
        assertThat(call("GET", "/api/v1/weights/latest", token, null).number("id")).isPositive();

        // --- removing a muscle group re-buckets its exercises -------------
        Reply updated = call("PUT", "/api/v1/settings", token, """
                {"showSetTime":true,"unit":"kg","distanceUnit":"km",
                 "muscleGroups":["Back","Legs","Shoulders","Arms","Core"]}
                """);
        assertThat(updated.status).isEqualTo(200);
        assertThat(updated.body.path("muscleGroups")).hasSize(5);
        assertThat(updated.body.path("unit").asString()).isEqualTo("kg");

        JsonNode libraryAfter = call("GET", "/api/v1/exercises", token, null).body;
        assertThat(libraryAfter.get(0).path("muscleGroup").asString()).isEqualTo("Unassigned");

        // --- the log survives, because it keeps its own copy --------------
        Reply weekAfter = call("GET", "/api/v1/weeks/2026-10-29", token, null);
        assertThat(weekAfter.body.path("entries").get(0).path("muscleGroup").asString())
                .isEqualTo("Chest");

        // --- deleting the entry drops the now-empty week ------------------
        assertThat(call("DELETE", "/api/v1/entries/" + entryId, token, null).status).isEqualTo(204);
        assertThat(call("GET", "/api/v1/weeks", token, null).body).isEmpty();
    }

    @Test
    void duplicateRegistrationAndBadPasswordsAreRejected() throws Exception {
        String first = """
                {"email":"dupe@example.com","username":"dupeuser","password":"secret123"}
                """;
        assertThat(call("POST", "/api/v1/auth/register", null, first).status).isEqualTo(201);
        assertThat(call("POST", "/api/v1/auth/register", null, first).status).isEqualTo(409);

        String wrongPassword = """
                {"email":"dupe@example.com","password":"not-the-password"}
                """;
        assertThat(call("POST", "/api/v1/auth/login", null, wrongPassword).status).isEqualTo(401);
    }

    @Test
    void validationErrorsComeBackAsAReadableBody() throws Exception {
        Reply bad = call("POST", "/api/v1/auth/register", null, """
                {"email":"not-an-email","username":"x","password":"short"}
                """);
        assertThat(bad.status).isEqualTo(400);
        assertThat(bad.text("message")).isEqualTo("Validation failed");
        assertThat(bad.text("details")).contains("email");
    }

    @Test
    void healthEndpointIsPublic() throws Exception {
        Reply health = call("GET", "/actuator/health", null, null);
        assertThat(health.status).isEqualTo(200);
        assertThat(health.text("status")).isEqualTo("UP");
    }

    @Test
    void friendRequestLifecycle() throws Exception {
        Reply aliceRegistered = register("alice@example.com", "aliceuser");
        assertThat(aliceRegistered.status).isEqualTo(201);
        String alice = login("alice@example.com", "secret123");
        assertThat(call("GET", "/api/v1/auth/me", alice, null).text("username")).isEqualTo("aliceuser");
        Reply bobRegistered = call("POST", "/api/v1/auth/register", null, """
                {"email":"bob@example.com","username":"bobuser","password":"secret123"}
                """);
        long bobId = bobRegistered.body.path("user").path("id").asLong();
        String bob = bobRegistered.text("token");

        // Directory tells the client which button to render.
        JsonNode found = call("GET", "/api/v1/users/search?q=bob", alice, null).body;
        assertThat(found).hasSize(1);
        assertThat(found.get(0).path("relationship").asString()).isEqualTo("none");

        Reply requested = call("POST", "/api/v1/friends/requests", alice,
                "{\"userId\":%d}".formatted(bobId));
        assertThat(requested.status).isEqualTo(201);
        assertThat(requested.text("status")).isEqualTo("pending");
        long friendshipId = requested.number("id");

        // The same row shows up as incoming for the addressee only.
        assertThat(call("GET", "/api/v1/friends", bob, null).body.path("incoming")).hasSize(1);
        assertThat(call("GET", "/api/v1/friends", alice, null).body.path("outgoing")).hasSize(1);

        // A pending request cannot be "removed" by the addressee; it must be declined.
        assertThat(call("DELETE", "/api/v1/friends/" + friendshipId, bob, null).status).isEqualTo(403);

        Reply accepted = call("POST", "/api/v1/friends/requests/" + friendshipId + "/accept", bob, null);
        assertThat(accepted.text("status")).isEqualTo("accepted");
        assertThat(call("GET", "/api/v1/friends", alice, null).body.path("friends")).hasSize(1);

        JsonNode afterAccept = call("GET", "/api/v1/users/search?q=bob", alice, null).body;
        assertThat(afterAccept.get(0).path("relationship").asString()).isEqualTo("friend");

        assertThat(call("DELETE", "/api/v1/friends/" + friendshipId, alice, null).status).isEqualTo(204);
        assertThat(call("GET", "/api/v1/friends", alice, null).body.path("friends")).isEmpty();

        // A second request after removal is allowed again.
        assertThat(call("POST", "/api/v1/friends/requests", alice,
                "{\"userId\":%d}".formatted(bobId)).status).isEqualTo(201);
    }

    private Reply register(String email, String username) throws Exception {
        return call("POST", "/api/v1/auth/register", null, """
                {"email":"%s","username":"%s","password":"secret123"}
                """.formatted(email, username));
    }

    private String login(String email, String password) throws Exception {
        return call("POST", "/api/v1/auth/login", null, """
                {"email":"%s","password":"%s"}
                """.formatted(email, password)).text("token");
    }

    private Reply call(String method, String path, String token, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        builder.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));

        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode parsed = response.body() == null || response.body().isBlank()
                ? null
                : json.readTree(response.body());
        return new Reply(response.statusCode(), parsed);
    }
}
