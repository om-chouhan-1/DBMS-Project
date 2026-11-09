const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dbms_project',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// ---------- Table config: display columns with FK names resolved ----------

const TABLE_CONFIG = {
  workspace: {
    columns: ['workspace_id', 'workspace_name'],
    from: 'workspace',
    expr: {
      workspace_id:   'workspace.workspace_id',
      workspace_name: 'workspace.workspace_name',
    },
  },
  users: {
    columns: ['u_id', 'u_name', 'email', 'joining_time', 'user_wage', 'workspace'],
    from: 'users LEFT JOIN workspace w ON users.workspace_id = w.workspace_id',
    expr: {
      u_id:         'users.u_id',
      u_name:       'users.u_name',
      email:        'users.email',
      joining_time: 'users.joining_time',
      user_wage:    'users.user_wage',
      workspace:    'w.workspace_name',
    },
  },
  clients: {
    columns: ['client_id', 'client_name', 'client_email', 'workspace'],
    from: 'clients LEFT JOIN workspace w ON clients.workspace_id = w.workspace_id',
    expr: {
      client_id:    'clients.client_id',
      client_name:  'clients.client_name',
      client_email: 'clients.client_email',
      workspace:    'w.workspace_name',
    },
  },
  projects: {
    columns: ['project_id', 'project_name', 'user_name', 'client_name', 'project_duration_worked', 'project_rate'],
    from: 'projects LEFT JOIN users u ON projects.u_id = u.u_id LEFT JOIN clients c ON projects.client_id = c.client_id',
    expr: {
      project_id:               'projects.project_id',
      project_name:             'projects.project_name',
      user_name:                'u.u_name',
      client_name:              'c.client_name',
      project_duration_worked:  'projects.project_duration_worked',
      project_rate:             'projects.project_rate',
    },
  },
  tasks: {
    columns: ['task_id', 'task_name', 'project_name', 'task_duration', 'task_start_time', 'status'],
    from: 'tasks LEFT JOIN projects p ON tasks.project_id = p.project_id',
    expr: {
      task_id:         'tasks.task_id',
      task_name:       'tasks.task_name',
      project_name:    'p.project_name',
      task_duration:   'tasks.task_duration',
      task_start_time: 'tasks.task_start_time',
      status:          'tasks.status',
    },
  },
  entries: {
    columns: ['timer_start', 'task_name', 'project_name', 'task_duration', 'task_start_time', 'timer_duration'],
    from: 'entries LEFT JOIN projects p ON entries.project_id = p.project_id LEFT JOIN tasks t ON entries.task_id = t.task_id',
    expr: {
      timer_start:    'entries.timer_start',
      task_name:      't.task_name',
      project_name:   'p.project_name',
      task_duration:  'entries.task_duration',
      task_start_time:'entries.task_start_time',
      timer_duration: 'entries.timer_duration',
    },
  },
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API ----------

// Schema: returns display column names per table
app.get('/api/schema', async (req, res) => {
  try {
    const schema = {};
    for (const [table, cfg] of Object.entries(TABLE_CONFIG)) {
      schema[table] = cfg.columns;
    }
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Table data with FK names resolved, column selection and sorting
app.get('/api/data/:table', async (req, res) => {
  try {
    const table = req.params.table.toLowerCase();
    const cfg = TABLE_CONFIG[table];
    if (!cfg) return res.status(400).json({ error: 'Invalid table' });

    // Determine which display columns to return
    let cols = cfg.columns;
    if (req.query.columns) {
      const requested = req.query.columns.split(',').filter(c => cfg.columns.includes(c));
      if (requested.length > 0) cols = requested;
    }

    // Build SELECT list from expressions
    const selectList = cols.map(c => `${cfg.expr[c]}::text AS "${c}"`).join(', ');

    // Build ORDER BY
    let orderClause = '';
    if (req.query.sortBy && cfg.columns.includes(req.query.sortBy)) {
      const dir = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      orderClause = ` ORDER BY ${cfg.expr[req.query.sortBy]} ${dir}`;
    }

    // Entries: always include the primary key (_ts, _td) so the UI can delete a row
    // even when those columns are hidden, and show newest entries first by default.
    let extraSelect = '';
    if (table === 'entries') {
      extraSelect = `, entries.timer_start::text AS "_ts", entries.timer_duration::text AS "_td"`;
      if (!orderClause) orderClause = ' ORDER BY entries.timer_start DESC';
    }

    const result = await pool.query(`SELECT ${selectList}${extraSelect} FROM ${cfg.from}${orderClause}`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggregate overview stats
app.get('/api/overview', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)::int         AS total_users,
        (SELECT COUNT(*) FROM projects)::int      AS total_projects,
        (SELECT COUNT(*) FROM tasks)::int         AS total_tasks,
        (SELECT COUNT(*) FROM clients)::int       AS total_clients,
        COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM e.timer_duration)/3600)::numeric, 1), 0)::float AS total_hours,
        COALESCE(ROUND(SUM(
          EXTRACT(EPOCH FROM e.timer_duration)/3600 *
          (SELECT user_wage FROM users WHERE u_id = p.u_id)
        )::numeric, 2), 0)::float AS total_earned
      FROM entries e
      JOIN projects p ON e.project_id = p.project_id
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-user summary (total tasks, hours, money earned, etc.)
app.get('/api/summary', async (req, res) => {
  try {
    const validCols = ['u_id','name','email','wage','total_projects','total_tasks','total_hours','total_earned'];
    const colMap = {
      u_id: 'u.u_id', name: 'u.u_name', email: 'u.email', wage: 'u.user_wage',
      total_projects: 'total_projects', total_tasks: 'total_tasks',
      total_hours: 'total_hours', total_earned: 'total_earned'
    };

    let orderClause = 'ORDER BY u.u_name';
    if (req.query.sortBy && validCols.includes(req.query.sortBy)) {
      const dir = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY ${colMap[req.query.sortBy]} ${dir}`;
    }

    const result = await pool.query(`
      SELECT
        u.u_id,
        u.u_name                                        AS name,
        u.email,
        u.user_wage                                     AS wage,
        COUNT(DISTINCT p.project_id)::int               AS total_projects,
        COUNT(DISTINCT t.task_id)::int                  AS total_tasks,
        COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM e.timer_duration)/3600)::numeric,1),0)::float AS total_hours,
        COALESCE(ROUND((SUM(EXTRACT(EPOCH FROM e.timer_duration)/3600)*u.user_wage)::numeric,2),0)::float AS total_earned
      FROM users u
      LEFT JOIN projects p ON u.u_id = p.u_id
      LEFT JOIN tasks t    ON p.project_id = t.project_id
      LEFT JOIN entries e  ON t.task_id = e.task_id
      GROUP BY u.u_id, u.u_name, u.email, u.user_wage
      ${orderClause}
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Time tracking: start/stop timers, add & delete entries ----------
//
// Running timers live in their own table (Active_Timers). When a timer is stopped
// it is turned into a normal row in Entries, so every existing query (overview,
// per-user summary, Entries table) keeps working exactly as before.

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Active_Timers (
      timer_id   serial    PRIMARY KEY,
      task_id    int       NOT NULL,
      started_at timestamp NOT NULL,
      CONSTRAINT active_timers_one_per_task UNIQUE (task_id),
      FOREIGN KEY (task_id) REFERENCES Tasks (task_id)
    )
  `);
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const MAX_MANUAL_ENTRY_MS = 24 * 60 * 60 * 1000;

// True only for real calendar dates/times ("2026-02-31 09:00:00" -> false)
function isRealDateTime(v) {
  const [, y, mo, d, h, mi, s] = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d &&
         dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
}

// "2026-03-01T10:00" or "2026-03-01 10:00:00" -> "2026-03-01 10:00:00" (or null)
function normalizeDateTime(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!DATETIME_RE.test(v)) return null;
  const spaced = v.replace('T', ' ');
  const full = spaced.length === 16 ? spaced + ':00' : spaced;
  return isRealDateTime(full) ? full : null;
}

function toMs(normalized) {
  return Date.parse(normalized.replace(' ', 'T') + 'Z');
}

function toId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sendError(res, err) {
  if (err.code === '23505') {
    return res.status(409).json({ error: 'An entry with the same start time and duration already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'That task does not exist.' });
  }
  if (err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ error: 'Invalid date, time or duration.' });
  }
  res.status(500).json({ error: err.message });
}

// Tasks to pick from (grouped by project in the UI)
app.get('/api/tracker/tasks', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.task_id, t.task_name, t.project_id, p.project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.project_id
      ORDER BY p.project_name, t.task_name, t.task_id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Currently running timers (elapsed time is computed by the database clock)
app.get('/api/timers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.timer_id,
             a.task_id,
             t.task_name,
             p.project_name,
             a.started_at::text AS started_at,
             GREATEST(EXTRACT(EPOCH FROM (localtimestamp - a.started_at)), 0)::float AS elapsed_seconds
      FROM active_timers a
      JOIN tasks t ON t.task_id = a.task_id
      LEFT JOIN projects p ON p.project_id = t.project_id
      ORDER BY a.started_at
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start a timer for a task
app.post('/api/timers', async (req, res) => {
  const taskId = toId(req.body && req.body.task_id);
  if (!taskId) return res.status(400).json({ error: 'Please choose a task.' });
  try {
    const result = await pool.query(`
      INSERT INTO active_timers (task_id, started_at)
      SELECT t.task_id, date_trunc('second', localtimestamp)
      FROM tasks t
      WHERE t.task_id = $1
      RETURNING timer_id
    `, [taskId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'That task does not exist.' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A timer is already running for this task.' });
    }
    sendError(res, err);
  }
});

// Stop a timer: save it as an Entries row and remove it from Active_Timers
app.post('/api/timers/:id/stop', async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid timer id.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const timer = await client.query(`
      SELECT task_id,
             started_at::text AS started_at,
             (GREATEST(date_trunc('second', localtimestamp - started_at), interval '1 second'))::text AS duration
      FROM active_timers
      WHERE timer_id = $1
      FOR UPDATE
    `, [id]);
    if (timer.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Timer not found. It may already have been stopped.' });
    }
    const { task_id, started_at, duration } = timer.rows[0];

    const inserted = await client.query(`
      INSERT INTO entries (timer_start, task_duration, project_id, task_start_time, timer_duration, task_id)
      SELECT $1::timestamp, t.task_duration, t.project_id, t.task_start_time, $2::interval, t.task_id
      FROM tasks t
      WHERE t.task_id = $3
      RETURNING timer_start::text AS timer_start, timer_duration::text AS timer_duration
    `, [started_at, duration, task_id]);
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'The task for this timer no longer exists.' });
    }

    await client.query('DELETE FROM active_timers WHERE timer_id = $1', [id]);
    await client.query('COMMIT');
    res.json(inserted.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err);
  } finally {
    client.release();
  }
});

// Discard a running timer without saving an entry
app.delete('/api/timers/:id', async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid timer id.' });
  try {
    const result = await pool.query('DELETE FROM active_timers WHERE timer_id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Timer not found.' });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Add an entry after the fact: { task_id, start, end }
app.post('/api/entries', async (req, res) => {
  const body = req.body || {};
  const taskId = toId(body.task_id);
  const start = normalizeDateTime(body.start);
  const end = normalizeDateTime(body.end);

  if (!taskId) return res.status(400).json({ error: 'Please choose a task.' });
  if (!start || !end) return res.status(400).json({ error: 'Please provide a valid start and end time.' });

  const diff = toMs(end) - toMs(start);
  if (Number.isNaN(diff)) return res.status(400).json({ error: 'Invalid date or time.' });
  if (diff <= 0) return res.status(400).json({ error: 'End time must be after the start time.' });
  if (diff > MAX_MANUAL_ENTRY_MS) {
    return res.status(400).json({ error: 'A single entry cannot be longer than 24 hours. Split it into several entries.' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO entries (timer_start, task_duration, project_id, task_start_time, timer_duration, task_id)
      SELECT $1::timestamp, t.task_duration, t.project_id, t.task_start_time,
             ($2::timestamp - $1::timestamp), t.task_id
      FROM tasks t
      WHERE t.task_id = $3
      RETURNING timer_start::text AS timer_start, timer_duration::text AS timer_duration
    `, [start, end, taskId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'That task does not exist.' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, err);
  }
});

// Delete an entry. Entries has no id column, so its primary key
// (timer_start + timer_duration) identifies the row: DELETE /api/entries?timer_start=..&timer_duration=..
app.delete('/api/entries', async (req, res) => {
  const { timer_start, timer_duration } = req.query;
  if (typeof timer_start !== 'string' || typeof timer_duration !== 'string' ||
      !timer_start || !timer_duration || timer_start.length > 40 || timer_duration.length > 80) {
    return res.status(400).json({ error: 'timer_start and timer_duration are required.' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM entries WHERE timer_start = $1::timestamp AND timer_duration = $2::interval',
      [timer_start, timer_duration]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found. It may already have been deleted.' });
    }
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;

ensureSchema()
  .catch(err => console.error('Could not create Active_Timers table (timers will not work):', err.message))
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Dashboard running at http://localhost:${PORT}`);
    });
  });
