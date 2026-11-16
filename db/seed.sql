-- Sample data, migrated 1:1 from the SQLite database (dbms_project.db).
-- Task names are mapped to generic task types. Alice is the only admin.
BEGIN;
INSERT INTO workspaces (id, name) VALUES (1, 'Acme Corp');
INSERT INTO users (id, workspace_id, name, email, role, hourly_rate, joined_at) VALUES
  (1, 1, 'Alice Smith', 'alice@example.com', 'admin', 50, '2025-01-15 09:00:00'),
  (2, 1, 'Bob Jones', 'bob@example.com', 'member', 45, '2025-02-01 09:30:00'),
  (3, 1, 'Charlie Brown', 'charlie@example.com', 'member', 60, '2025-03-10 10:00:00'),
  (4, 1, 'Diana Prince', 'diana@example.com', 'member', 55, '2025-04-05 08:45:00'),
  (5, 1, 'Evan Wright', 'evan@example.com', 'member', 40, '2025-05-20 11:00:00');
INSERT INTO clients (id, workspace_id, name, email) VALUES
  (1, 1, 'Client Alpha', 'alpha@client.com'),
  (2, 1, 'Client Beta', 'beta@client.com'),
  (3, 1, 'Client Gamma', 'gamma@client.com');
INSERT INTO projects (id, client_id, name, billing_rate) VALUES
  (1, 1, 'Website Redesign', 100),
  (2, 2, 'Mobile App', 120),
  (3, 3, 'API Integration', 90),
  (4, 1, 'Database Migration', 110),
  (5, 2, 'Security Audit', 150);
INSERT INTO tasks (id, project_id, task_type_id, name, estimated_duration, planned_start, completed) VALUES
  (1, 1, (SELECT id FROM task_types WHERE code = 'design'), 'Wireframing', INTERVAL '7200 seconds', '2026-03-01 10:00:00', TRUE),
  (2, 1, (SELECT id FROM task_types WHERE code = 'design'), 'UI Design', INTERVAL '14400 seconds', '2026-03-02 10:00:00', TRUE),
  (3, 1, (SELECT id FROM task_types WHERE code = 'frontend'), 'Frontend Layout', INTERVAL '14400 seconds', '2026-03-03 10:00:00', FALSE),
  (4, 2, (SELECT id FROM task_types WHERE code = 'frontend'), 'Auth Screen', INTERVAL '10800 seconds', '2026-03-01 11:00:00', TRUE),
  (5, 2, (SELECT id FROM task_types WHERE code = 'frontend'), 'Dashboard UI', INTERVAL '18000 seconds', '2026-03-02 11:00:00', TRUE),
  (6, 2, (SELECT id FROM task_types WHERE code = 'backend'), 'API Client', INTERVAL '25200 seconds', '2026-03-03 11:00:00', FALSE),
  (7, 3, (SELECT id FROM task_types WHERE code = 'backend'), 'Endpoint Setup', INTERVAL '7200 seconds', '2026-03-04 09:00:00', TRUE),
  (8, 3, (SELECT id FROM task_types WHERE code = 'backend'), 'Token Auth', INTERVAL '10800 seconds', '2026-03-04 12:00:00', FALSE),
  (9, 4, (SELECT id FROM task_types WHERE code = 'database'), 'Schema Export', INTERVAL '7200 seconds', '2026-03-05 10:00:00', TRUE),
  (10, 4, (SELECT id FROM task_types WHERE code = 'database'), 'Data Scrubbing', INTERVAL '14400 seconds', '2026-03-05 13:00:00', TRUE),
  (11, 4, (SELECT id FROM task_types WHERE code = 'database'), 'Index Optimization', INTERVAL '7200 seconds', '2026-03-06 10:00:00', FALSE),
  (12, 5, (SELECT id FROM task_types WHERE code = 'testing'), 'Vulnerability Scan', INTERVAL '18000 seconds', '2026-03-07 09:00:00', TRUE),
  (13, 5, (SELECT id FROM task_types WHERE code = 'testing'), 'Dependency Check', INTERVAL '18000 seconds', '2026-03-07 14:00:00', TRUE),
  (14, 5, (SELECT id FROM task_types WHERE code = 'devops'), 'Patch Application', INTERVAL '21600 seconds', '2026-03-08 09:00:00', FALSE),
  (15, 5, (SELECT id FROM task_types WHERE code = 'testing'), 'Final Review', INTERVAL '14400 seconds', '2026-03-08 15:00:00', FALSE);
INSERT INTO time_entries (user_id, task_id, started_at, ended_at) VALUES
  (1, 1, '2026-03-01 10:00:00', '2026-03-01 12:00:00'),
  (2, 4, '2026-03-01 11:00:00', '2026-03-01 14:00:00'),
  (1, 1, '2026-03-01 12:00:00', '2026-03-01 13:30:00'),
  (1, 2, '2026-03-02 10:00:00', '2026-03-02 14:00:00'),
  (2, 5, '2026-03-02 11:00:00', '2026-03-02 13:30:00'),
  (2, 5, '2026-03-02 14:00:00', '2026-03-02 16:30:00'),
  (1, 3, '2026-03-03 10:00:00', '2026-03-03 12:00:00'),
  (2, 6, '2026-03-03 11:00:00', '2026-03-03 15:00:00'),
  (1, 3, '2026-03-03 13:00:00', '2026-03-03 15:00:00'),
  (2, 6, '2026-03-03 15:00:00', '2026-03-03 18:00:00'),
  (3, 7, '2026-03-04 09:00:00', '2026-03-04 11:00:00'),
  (3, 8, '2026-03-04 12:00:00', '2026-03-04 13:30:00'),
  (3, 8, '2026-03-04 14:00:00', '2026-03-04 15:30:00'),
  (4, 9, '2026-03-05 10:00:00', '2026-03-05 12:00:00'),
  (4, 10, '2026-03-05 13:00:00', '2026-03-05 15:00:00'),
  (4, 10, '2026-03-05 15:00:00', '2026-03-05 17:00:00'),
  (4, 11, '2026-03-06 10:00:00', '2026-03-06 12:00:00'),
  (5, 12, '2026-03-07 09:00:00', '2026-03-07 12:00:00'),
  (5, 13, '2026-03-07 12:00:00', '2026-03-07 14:00:00'),
  (5, 14, '2026-03-07 14:00:00', '2026-03-07 19:00:00'),
  (3, 7, '2026-11-09 22:59:26', '2026-11-09 22:59:36'),
  (3, 8, '2026-11-16 20:38:00', '2026-11-16 21:38:00'),
  (3, 7, '2026-11-16 21:37:50', '2026-11-16 21:37:54'),
  (3, 7, '2026-11-16 21:38:04', '2026-11-16 21:38:09'),
  (3, 8, '2026-11-16 21:39:13', '2026-11-16 21:39:17');
SELECT setval(pg_get_serial_sequence('workspaces','id'), (SELECT MAX(id) FROM workspaces));
SELECT setval(pg_get_serial_sequence('users','id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('clients','id'), (SELECT MAX(id) FROM clients));
SELECT setval(pg_get_serial_sequence('projects','id'), (SELECT MAX(id) FROM projects));
SELECT setval(pg_get_serial_sequence('tasks','id'), (SELECT MAX(id) FROM tasks));
COMMIT;
