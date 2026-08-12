--liquibase formatted sql

-- Optimistic locking (@Version). Existing rows start at 0, which is what
-- Hibernate expects for a fresh entity.
--changeset gymbro:007-version-settings
ALTER TABLE user_settings ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE user_settings DROP COLUMN version;

--changeset gymbro:007-version-entries
ALTER TABLE workout_entries ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE workout_entries DROP COLUMN version;
