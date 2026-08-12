package com.gymbro.backend.service;

import java.util.List;

import com.gymbro.backend.dto.SettingsResponse;

/**
 * Per-user preferences, including the ordered muscle-group list and the
 * body-weight goal.
 *
 * <p>Settings are replaced as a whole ({@code PUT}), which is also what makes
 * "the user deleted a muscle group" detectable: any group missing from the new
 * list has its exercises moved to the {@link #UNASSIGNED_GROUP} bucket in the
 * same transaction, so no exercise is ever orphaned by a rename.
 */
public interface SettingsService {

    /** Same defaults as the client's {@code MUSCLE_GROUPS}. */
    List<String> DEFAULT_MUSCLE_GROUPS =
            List.of("Chest", "Back", "Legs", "Shoulders", "Arms", "Core");

    /** Bucket for exercises whose muscle group no longer exists. */
    String UNASSIGNED_GROUP = "Unassigned";

    /** Called once at registration so a new account opens with usable defaults. */
    void createDefaults(Long userId);

    SettingsResponse get(Long userId);

    SettingsResponse update(Long userId, SettingsResponse.Request request);
}
