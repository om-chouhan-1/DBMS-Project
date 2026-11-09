-- SQLite version of the schema.
-- Timestamps are stored as TEXT 'YYYY-MM-DD HH:MM:SS'.
-- Intervals (durations) are stored as INTEGER seconds.
-- Booleans (Tasks.status) are stored as 0/1.

CREATE TABLE IF NOT EXISTS Workspace (
  workspace_id   INTEGER PRIMARY KEY,
  workspace_name TEXT
);

CREATE TABLE IF NOT EXISTS Users (
  u_id         INTEGER PRIMARY KEY,
  u_name       TEXT,
  email        TEXT,
  joining_time TEXT,
  user_wage    INTEGER,
  workspace_id INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES Workspace (workspace_id)
);

CREATE TABLE IF NOT EXISTS Clients (
  client_id    INTEGER PRIMARY KEY,
  client_name  TEXT NOT NULL,
  workspace_id INTEGER NOT NULL,
  client_email TEXT,
  FOREIGN KEY (workspace_id) REFERENCES Workspace (workspace_id)
);

CREATE TABLE IF NOT EXISTS Projects (
  project_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name            TEXT,
  u_id                    INTEGER NOT NULL,
  client_id               INTEGER,
  project_duration_worked INTEGER,          -- seconds
  project_rate            INTEGER,
  FOREIGN KEY (client_id) REFERENCES Clients (client_id),
  FOREIGN KEY (u_id)      REFERENCES Users (u_id)
);

CREATE TABLE IF NOT EXISTS Tasks (
  task_id         INTEGER PRIMARY KEY,
  task_name       TEXT,
  project_id      INTEGER NOT NULL,
  task_duration   INTEGER NOT NULL,         -- seconds
  task_start_time TEXT    NOT NULL,
  status          INTEGER,                  -- 0 / 1
  FOREIGN KEY (project_id) REFERENCES Projects (project_id)
);

CREATE TABLE IF NOT EXISTS Entries (
  timer_start     TEXT    NOT NULL,
  task_duration   INTEGER,                  -- seconds
  project_id      INTEGER NOT NULL,
  task_start_time TEXT,
  timer_duration  INTEGER NOT NULL,         -- seconds
  task_id         INTEGER NOT NULL,
  PRIMARY KEY (timer_start, timer_duration),
  FOREIGN KEY (project_id) REFERENCES Projects (project_id),
  FOREIGN KEY (task_id)    REFERENCES Tasks (task_id)
);

-- Running timers (started but not yet stopped).
CREATE TABLE IF NOT EXISTS Active_Timers (
  timer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL UNIQUE,
  started_at TEXT    NOT NULL,
  FOREIGN KEY (task_id) REFERENCES Tasks (task_id)
);
