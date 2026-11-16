# Workspace Dashboard (PostgreSQL)

## Setup

1. Create a database: `createdb DBMS`
2. Install and start:

```bash
npm install
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DBMS npm start
```

Open http://localhost:3000. The first start creates the tables and loads the sample data.
`npm run reset` drops the tables and loads the sample data again.

Optional environment variables: `PORT` (default 3000), `APP_TIMEZONE` (default `Asia/Kolkata`).

## Files

- `db/schema.sql`: tables, task types, duration rules, and the access-rule function `can_view_user()`
- `db/seed.sql`: your existing SQLite data, migrated 1:1 (task names mapped to generic task types)
- `server.js`: HTTP API (uses `pg`, no other dependencies)
- `public/`: dark-theme dashboard (`index.html`, `style.css`, `app.js`)

## Roles and visibility

| Role   | Can see                                                                 |
|--------|-------------------------------------------------------------------------|
| admin  | Every user's time entries, running timers, and totals                   |
| member | Their own work and other members' work. Never an admin's work, and admins are not listed in member views |

Members can delete only their own entries. Admins can delete any entry. Only a user can stop or discard their own timer.

The rule lives in one database function, `can_view_user(viewer_id, owner_id)`, and every query uses it. Changing the rule means changing that one function.

Sign-in is a demo picker in the header with no passwords. Before real use, replace `getViewer()` in `server.js` with real authentication.

## Time and duration

- `time_entries.started_at` and `ended_at` are the clock times of the work.
- `time_entries.duration` is computed by Postgres (`ended_at - started_at`). It is the time actually worked.
- `tasks.estimated_duration` is the planned length of the task. It is never copied into entries.
- Task "actual duration" is the sum of visible entries for that task. It is calculated in queries, not stored.

Earlier, each entry copied the task's planned duration into its own `task_duration` column. Because a single session often covered the whole task, the two columns looked identical. They are now separate, and the names say what each one means.

## Task types

Tasks are grouped by generic type: Frontend, Backend, Database, Design, Testing, DevOps, and General. Add more with an `INSERT` into `task_types`.
