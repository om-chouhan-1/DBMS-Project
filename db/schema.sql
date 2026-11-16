-- Workspace dashboard: PostgreSQL schema.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS workspaces (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces (id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  hourly_rate   NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  joined_at     TIMESTAMP NOT NULL DEFAULT LOCALTIMESTAMP(0)
);

CREATE TABLE IF NOT EXISTS clients (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces (id),
  name          TEXT NOT NULL,
  email         TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  client_id     INT REFERENCES clients (id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  billing_rate  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (billing_rate >= 0)
);

-- Generic kinds of work. Tasks point at one of these.
CREATE TABLE IF NOT EXISTS task_types (
  id     SERIAL PRIMARY KEY,
  code   TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL
);

INSERT INTO task_types (code, label) VALUES
  ('frontend', 'Frontend'),
  ('backend',  'Backend'),
  ('database', 'Database'),
  ('design',   'Design'),
  ('testing',  'Testing'),
  ('devops',   'DevOps'),
  ('general',  'General')
ON CONFLICT (code) DO NOTHING;

-- estimated_duration is the PLANNED length of the task.
-- It is never copied into time entries; actual time comes from time_entries.
CREATE TABLE IF NOT EXISTS tasks (
  id                  SERIAL PRIMARY KEY,
  project_id          INT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_type_id        INT NOT NULL REFERENCES task_types (id),
  name                TEXT NOT NULL,
  estimated_duration  INTERVAL NOT NULL CHECK (estimated_duration > INTERVAL '0'),
  planned_start       TIMESTAMP,
  completed           BOOLEAN NOT NULL DEFAULT FALSE
);

-- One row per period of work actually done by a user on a task.
-- duration is computed by the database from the two timestamps, so it cannot drift.
CREATE TABLE IF NOT EXISTS time_entries (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_id     INT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  started_at  TIMESTAMP NOT NULL,
  ended_at    TIMESTAMP NOT NULL,
  duration    INTERVAL GENERATED ALWAYS AS (ended_at - started_at) STORED,
  CONSTRAINT time_entries_order   CHECK (ended_at > started_at),
  CONSTRAINT time_entries_max_day CHECK (ended_at - started_at <= INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries (user_id);
CREATE INDEX IF NOT EXISTS time_entries_task_idx ON time_entries (task_id);

-- Timers that are running right now. One per user.
CREATE TABLE IF NOT EXISTS running_timers (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL,
  task_id     INT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  started_at  TIMESTAMP NOT NULL DEFAULT LOCALTIMESTAMP(0),
  CONSTRAINT running_timers_one_per_user UNIQUE (user_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ACCESS RULE (single source of truth, used by every query):
--   admin   -> can view everyone's work
--   member  -> can view their own work and other members' work, never an admin's
CREATE OR REPLACE FUNCTION can_view_user(viewer_id INT, owner_id INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users v
    JOIN users o ON o.id = owner_id
    WHERE v.id = viewer_id
      AND (v.role = 'admin' OR v.id = o.id OR o.role = 'member')
  );
$$;
