--liquibase formatted sql

-- Enum values moved from lowercase codes to enum names (KG/LBS, MI/KM).
-- Order matters: drop the old CHECK first, then convert data, then re-add it.
--changeset gymbro:006-settings-enums
ALTER TABLE user_settings DROP CONSTRAINT ck_settings_unit;
ALTER TABLE user_settings DROP CONSTRAINT ck_settings_distance_unit;
UPDATE user_settings SET unit = UPPER(unit), distance_unit = UPPER(distance_unit);
ALTER TABLE user_settings ALTER COLUMN unit SET DEFAULT 'LBS';
ALTER TABLE user_settings ALTER COLUMN distance_unit SET DEFAULT 'MI';
ALTER TABLE user_settings ADD CONSTRAINT ck_settings_unit CHECK (unit IN ('KG', 'LBS'));
ALTER TABLE user_settings ADD CONSTRAINT ck_settings_distance_unit CHECK (distance_unit IN ('MI', 'KM'));
--rollback ALTER TABLE user_settings DROP CONSTRAINT ck_settings_distance_unit;
--rollback ALTER TABLE user_settings DROP CONSTRAINT ck_settings_unit;
--rollback UPDATE user_settings SET unit = LOWER(unit), distance_unit = LOWER(distance_unit);
--rollback ALTER TABLE user_settings ADD CONSTRAINT ck_settings_unit CHECK (unit IN ('kg', 'lbs'));
--rollback ALTER TABLE user_settings ADD CONSTRAINT ck_settings_distance_unit CHECK (distance_unit IN ('mi', 'km'));

--changeset gymbro:006-friendship-status
ALTER TABLE friendships DROP CONSTRAINT ck_friendships_status;
UPDATE friendships SET status = UPPER(status);
ALTER TABLE friendships ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE friendships ADD CONSTRAINT ck_friendships_status CHECK (status IN ('PENDING', 'ACCEPTED'));
--rollback ALTER TABLE friendships DROP CONSTRAINT ck_friendships_status;
--rollback UPDATE friendships SET status = LOWER(status);
--rollback ALTER TABLE friendships ADD CONSTRAINT ck_friendships_status CHECK (status IN ('pending', 'accepted'));
