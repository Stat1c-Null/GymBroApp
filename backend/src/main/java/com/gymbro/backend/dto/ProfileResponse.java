package com.gymbro.backend.dto;

import com.gymbro.backend.enums.Relationship;

/**
 * A searchable directory entry: the minimum needed to find and label a person.
 *
 * @param relationship so the UI can render the right button
 *                     ("Friends" / "Requested" / "Accept") without a second
 *                     query per result.
 */
public record ProfileResponse(Long id, String username, String displayName,
        Relationship relationship) {
}
