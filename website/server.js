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

    const result = await pool.query(`SELECT ${selectList} FROM ${cfg.from}${orderClause}`);
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

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
