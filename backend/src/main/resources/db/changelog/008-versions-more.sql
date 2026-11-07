--liquibase formatted sql

-- Optimistic locking for User, Exercise, Friendship, WorkoutWeek.
-- Existing rows start at 0, which is what Hibernate expects for a fresh entity.

--changeset gymbro:008-user-version
ALTER TABLE users ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE users DROP COLUMN version;

--changeset gymbro:008-exercise-version
ALTER TABLE exercises ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE exercises DROP COLUMN version;

--changeset gymbro:008-friendship-version
ALTER TABLE friendships ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE friendships DROP COLUMN version;

--changeset gymbro:008-workout-week-version
ALTER TABLE workout_weeks ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE workout_weeks DROP COLUMN version;