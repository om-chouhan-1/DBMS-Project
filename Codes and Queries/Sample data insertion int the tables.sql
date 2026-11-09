INSERT INTO Workspace (workspace_id, workspace_name) VALUES (1, 'Acme Corp');

INSERT INTO Users (u_name, email, u_id, joining_time, user_wage, workspace_id) VALUES 
('Alice Smith', 'alice@example.com', 1, '2025-01-15 09:00:00', 50, 1),
('Bob Jones', 'bob@example.com', 2, '2025-02-01 09:30:00', 45, 1),
('Charlie Brown', 'charlie@example.com', 3, '2025-03-10 10:00:00', 60, 1),
('Diana Prince', 'diana@example.com', 4, '2025-04-05 08:45:00', 55, 1),
('Evan Wright', 'evan@example.com', 5, '2025-05-20 11:00:00', 40, 1);

INSERT INTO Clients (client_name, client_email, workspace_id, client_id) VALUES 
('Client Alpha', 'alpha@client.com', 1, 1),
('Client Beta', 'beta@client.com', 1, 2),
('Client Gamma', 'gamma@client.com', 1, 3);

INSERT INTO Projects (project_duration_worked, project_name, project_rate, u_id, client_id) VALUES 
('10 hours', 'Website Redesign', 100, 1, 1),
('15 hours', 'Mobile App', 120, 2, 2),
('5 hours', 'API Integration', 90, 3, 3),
('8 hours', 'Database Migration', 110, 4, 1),
('20 hours', 'Security Audit', 150, 5, 2);

INSERT INTO Tasks (task_name, task_duration, task_start_time, status, project_id, task_id) VALUES 
('Wireframing', '2 hours', '2026-03-01 10:00:00', true, 1, 1),
('UI Design', '4 hours', '2026-03-02 10:00:00', true, 1, 2),
('Frontend Layout', '4 hours', '2026-03-03 10:00:00', false, 1, 3),
('Auth Screen', '3 hours', '2026-03-01 11:00:00', true, 2, 4),
('Dashboard UI', '5 hours', '2026-03-02 11:00:00', true, 2, 5),
('API Client', '7 hours', '2026-03-03 11:00:00', false, 2, 6),
('Endpoint Setup', '2 hours', '2026-03-04 09:00:00', true, 3, 7),
('Token Auth', '3 hours', '2026-03-04 12:00:00', false, 3, 8),
('Schema Export', '2 hours', '2026-03-05 10:00:00', true, 4, 9),
('Data Scrubbing', '4 hours', '2026-03-05 13:00:00', true, 4, 10),
('Index Optimization', '2 hours', '2026-03-06 10:00:00', false, 4, 11),
('Vulnerability Scan', '5 hours', '2026-03-07 09:00:00', true, 5, 12),
('Dependency Check', '5 hours', '2026-03-07 14:00:00', true, 5, 13),
('Patch Application', '6 hours', '2026-03-08 09:00:00', false, 5, 14),
('Final Review', '4 hours', '2026-03-08 15:00:00', false, 5, 15);

INSERT INTO Entries (timer_start, project_id, task_duration, task_start_time, timer_duration, task_id) VALUES 
('2026-03-01 10:00:00', 1, '2 hours', '2026-03-01 10:00:00', '2 hours', 1),
('2026-03-01 12:00:00', 1, '2 hours', '2026-03-01 12:00:00', '1 hour 30 minutes', 1),
('2026-03-02 10:00:00', 1, '4 hours', '2026-03-02 10:00:00', '4 hours', 2),
('2026-03-03 10:00:00', 1, '4 hours', '2026-03-03 10:00:00', '2 hours', 3),
('2026-03-03 13:00:00', 1, '4 hours', '2026-03-03 10:00:00', '2 hours', 3),
('2026-03-01 11:00:00', 2, '3 hours', '2026-03-01 11:00:00', '3 hours', 4),
('2026-03-02 11:00:00', 2, '5 hours', '2026-03-02 11:00:00', '2 hours 30 minutes', 5),
('2026-03-02 14:00:00', 2, '5 hours', '2026-03-02 11:00:00', '2 hours 30 minutes', 5),
('2026-03-03 11:00:00', 2, '7 hours', '2026-03-03 11:00:00', '4 hours', 6),
('2026-03-03 15:00:00', 2, '7 hours', '2026-03-03 11:00:00', '3 hours', 6),
('2026-03-04 09:00:00', 3, '2 hours', '2026-03-04 09:00:00', '2 hours', 7),
('2026-03-04 12:00:00', 3, '3 hours', '2026-03-04 12:00:00', '1 hour 30 minutes', 8),
('2026-03-04 14:00:00', 3, '3 hours', '2026-03-04 12:00:00', '1 hour 30 minutes', 8),
('2026-03-05 10:00:00', 4, '2 hours', '2026-03-05 10:00:00', '2 hours', 9),
('2026-03-05 13:00:00', 4, '4 hours', '2026-03-05 13:00:00', '2 hours', 10),
('2026-03-05 15:00:00', 4, '4 hours', '2026-03-05 13:00:00', '2 hours', 10),
('2026-03-06 10:00:00', 4, '2 hours', '2026-03-06 10:00:00', '2 hours', 11),
('2026-03-07 09:00:00', 5, '5 hours', '2026-03-07 09:00:00', '3 hours', 12),
('2026-03-07 12:00:00', 5, '5 hours', '2026-03-07 14:00:00', '2 hours', 13),
('2026-03-07 14:00:00', 5, '6 hours', '2026-03-08 09:00:00', '5 hours', 14);