package com.gymbro.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.gymbro.backend.model.UserSettings;

public interface UserSettingsRepository extends JpaRepository<UserSettings, Long> {
}
