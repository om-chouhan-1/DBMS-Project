# Workspace Dashboard

A minimal PostgreSQL-backed dashboard for the DBMS Project database.

## Setup

### 1. Configure database connection

Edit `website/.env` with your PostgreSQL credentials:

```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=dbms_project
DB_PASSWORD=your_password
DB_PORT=5432
PORT=3000
```

### 2. Create the database and seed data

```
cd website
node setup-db.js
```

This creates the database, runs the schema, and inserts sample data.

### 3. Start the server

```
cd website
node server.js
```

Open **http://localhost:3000** in your browser.

## Features

- **Configure** button (top-right) opens a settings drawer where you can:
  - **Toggle sections** on/off (Overview, User Summary, Users, Clients, Projects, Tasks, Workspace, Entries)
  - **Reorder sections** with ↑↓ buttons
  - **Pick columns** to display for each section
  - **Sort** each section by any column, ascending or descending
- **Overview** cards show aggregate stats (total users, projects, tasks, hours, earnings)
- **User Summary** table shows per-user totals (tasks, hours, money earned)
- All settings are saved in your browser and persist across refreshes

## Time entries (add / delete)

The **Entries** section is also where you manage time entries:

- **Start timer** – pick a task and click *Start timer*. A live clock shows the running time. Click **Stop** to save it as an entry (start time + elapsed time). **Discard** throws a running timer away without saving.
- **Add past entry** – log time after it has already passed: pick the task, then the start and end time (max 24 hours per entry).
- **Delete** – every row in the Entries table has a *Delete* button (asks for confirmation first).

Notes:

- Running timers are kept in a small extra table, `Active_Timers`. It is created automatically when the server starts (and is also in `Codes and Queries/Schema.sql` for fresh setups), so existing databases need no manual migration. A stopped timer becomes a normal row in `Entries`, so the Overview and User Summary totals include it.
- One running timer per task at a time. Timers use the database server's clock.
- `Entries` has no id column; a row is identified by its primary key (`timer_start` + `timer_duration`), so two entries can't share the same start time and duration.

### API

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/api/tracker/tasks` | Tasks for the dropdowns |
| GET | `/api/timers` | Running timers |
| POST | `/api/timers` `{ task_id }` | Start a timer |
| POST | `/api/timers/:id/stop` | Stop a timer and save it as an entry |
| DELETE | `/api/timers/:id` | Discard a running timer |
| POST | `/api/entries` `{ task_id, start, end }` | Add an entry after the fact |
| DELETE | `/api/entries?timer_start=…&timer_duration=…` | Delete an entry |
