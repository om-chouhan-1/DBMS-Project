/**
 * Workspace Dashboard: PostgreSQL edition.
 *
 *   npm install
 *   DATABASE_URL=postgres://user:password@localhost:5432/DBMS npm start
 *   npm run reset            drops the tables, re-creates them and re-seeds
 *
 * Access rules are enforced in the database by can_view_user() (see db/schema.sql):
 *   admin   sees every user's time entries and running timers
 *   member  sees their own work and other members' work, never an admin's work
 *
 * Sign-in is a demo picker (no passwords). Replace getViewer() with real
 * authentication before using this with real data.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/DBMS';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const DB_DIR = path.join(__dirname, 'db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TABLE_NAMES = ['running_timers', 'time_entries', 'tasks', 'task_types', 'projects', 'clients', 'users', 'workspaces'];

// The timezone is put into a SQL string, so only accept plain zone names.
if (!/^[A-Za-z_/+-]+$/.test(APP_TIMEZONE)) throw new Error('APP_TIMEZONE has unexpected characters');

const pool = new Pool({ connectionString: DATABASE_URL });
pool.on('connect', client => {
  client.query(`SET TIME ZONE '${APP_TIMEZONE}'`).catch(err => console.error('Could not set time zone:', err.message));
});

const readSql = name => fs.readFileSync(path.join(DB_DIR, name), 'utf-8');

async function setupDatabase(reset) {
  if (reset) {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE_NAMES.join(', ')} CASCADE`);
    console.log('Existing tables dropped.');
  }
  await pool.query(readSql('schema.sql'));
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM workspaces');
  if (rows[0].n === 0) {
    await pool.query(readSql('seed.sql'));
    console.log('Sample data inserted.');
  }
}

// ---------- Errors ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const CONSTRAINT_MESSAGES = {
  time_entries_order: 'End time must be after the start time.',
  time_entries_max_day: 'A single entry cannot be longer than 24 hours. Split it into several entries.',
  running_timers_one_per_user: 'You already have a running timer. Stop it before starting another.',
};

function translateDbError(err) {
  if (err instanceof HttpError) return err;
  switch (err.code) {
    case '23505': return new HttpError(409, CONSTRAINT_MESSAGES[err.constraint] || 'That already exists.');
    case '23503': return new HttpError(400, 'A linked item does not exist.');
    case '23514': return new HttpError(400, CONSTRAINT_MESSAGES[err.constraint] || 'A value is out of range.');
    case '22007':
    case '22008': return new HttpError(400, 'Invalid date or time.');
    default: return err;
  }
}

// ---------- Helpers ----------
const toId = v => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
function sqlDateTime(v) {
  if (typeof v !== 'string' || !DATETIME_RE.test(v.trim())) return null;
  const s = v.trim().replace('T', ' ');
  return s.length === 16 ? s + ':00' : s;
}

// The signed-in user. Every request except sign-in options needs one.
async function getViewer(req) {
  const id = toId(req.headers['x-user-id']);
  if (!id) throw new HttpError(401, 'Choose who you are signed in as.');
  const { rows } = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
  if (!rows.length) throw new HttpError(401, 'That user does not exist.');
  return rows[0];
}

const ts = col => `to_char(${col}, 'YYYY-MM-DD HH24:MI')`;
const secs = interval => `FLOOR(EXTRACT(EPOCH FROM ${interval}))::int`;

// Each column is [SQL expression, type]. The type tells the browser how to format it.
// `vid` is the signed-in user's integer id from the database, so it is safe to inline.
function tableConfigs(vid) {
  const actualSeconds = `COALESCE((SELECT ${secs('SUM(te.duration)')} FROM time_entries te
    WHERE te.task_id = t.id AND can_view_user(${vid}, te.user_id)), 0)`;
  return {
    users: {
      from: 'users u',
      where: `can_view_user(${vid}, u.id)`,
      order: 'u.name',
      expr: {
        id: ['u.id', 'int'],
        name: ['u.name', 'text'],
        email: ['u.email', 'text'],
        role: ['u.role', 'text'],
        hourly_rate: ['u.hourly_rate::float8', 'money'],
        joined_at: [ts('u.joined_at'), 'text'],
      },
    },
    clients: {
      from: 'clients c',
      where: 'TRUE',
      order: 'c.name',
      expr: {
        id: ['c.id', 'int'],
        name: ['c.name', 'text'],
        email: ['c.email', 'text'],
      },
    },
    projects: {
      from: 'projects p LEFT JOIN clients c ON c.id = p.client_id',
      where: 'TRUE',
      order: 'p.name',
      expr: {
        id: ['p.id', 'int'],
        name: ['p.name', 'text'],
        client: ['c.name', 'text'],
        billing_rate: ['p.billing_rate::float8', 'money'],
      },
    },
    tasks: {
      from: 'tasks t JOIN projects p ON p.id = t.project_id JOIN task_types tt ON tt.id = t.task_type_id',
      where: 'TRUE',
      order: 'p.name, t.name',
      expr: {
        id: ['t.id', 'int'],
        name: ['t.name', 'text'],
        project: ['p.name', 'text'],
        task_type: ['tt.label', 'text'],
        estimated_duration: [secs('t.estimated_duration'), 'seconds'],   // planned
        actual_duration: [actualSeconds, 'seconds'],                    // measured, visible work only
        completed: ['t.completed', 'bool'],
      },
    },
    entries: {
      from: `time_entries te
        JOIN users u ON u.id = te.user_id
        JOIN tasks t ON t.id = te.task_id
        JOIN task_types tt ON tt.id = t.task_type_id
        JOIN projects p ON p.id = t.project_id`,
      where: `can_view_user(${vid}, te.user_id)`,
      order: 'te.started_at DESC',
      expr: {
        id: ['te.id', 'int'],
        user: ['u.name', 'text'],
        task: ['t.name', 'text'],
        task_type: ['tt.label', 'text'],
        project: ['p.name', 'text'],
        started_at: [ts('te.started_at'), 'text'],
        ended_at: [ts('te.ended_at'), 'text'],
        duration: [secs('te.duration'), 'seconds'],                     // what was actually worked
        task_estimate: [secs('t.estimated_duration'), 'seconds'],       // what the task was planned for
      },
    },
  };
}

// ---------- Routes ----------
const routes = [];
const route = (method, pattern, fn, open = false) =>
  routes.push({ method, re: new RegExp('^' + pattern + '$'), fn, open });

route('GET', '/api/signin-options', async () => {
  // Only identity (name and role) is listed here, never any work data.
  const { rows } = await pool.query('SELECT id, name, role FROM users ORDER BY id');
  return [200, rows];
}, true);

route('GET', '/api/me', async ({ viewer }) => [200, viewer]);

route('GET', '/api/schema', async () => {
  const schema = {};
  for (const [table, cfg] of Object.entries(tableConfigs(0))) {
    schema[table] = Object.entries(cfg.expr).map(([name, [, type]]) => ({ name, type }));
  }
  return [200, schema];
});

route('GET', '/api/data/([a-z_]+)', async ({ viewer, query, params }) => {
  const cfg = tableConfigs(viewer.id)[params[0]];
  if (!cfg) throw new HttpError(400, 'Invalid table');

  const all = Object.keys(cfg.expr);
  const requested = (query.get('columns') || '').split(',').filter(c => all.includes(c));
  const cols = requested.length ? requested : all;
  const select = cols.map(c => `${cfg.expr[c][0]} AS "${c}"`).join(', ');

  const sortBy = query.get('sortBy');
  const dir = query.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';
  const order = all.includes(sortBy) ? `ORDER BY ${cfg.expr[sortBy][0]} ${dir}` : `ORDER BY ${cfg.order}`;

  const { rows } = await pool.query(`SELECT ${select} FROM ${cfg.from} WHERE ${cfg.where} ${order}`);
  return [200, rows];
});

route('GET', '/api/overview', async ({ viewer }) => {
  const vid = viewer.id;
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users u WHERE can_view_user(${vid}, u.id)) AS total_users,
      (SELECT COUNT(*)::int FROM projects) AS total_projects,
      (SELECT COUNT(*)::int FROM tasks) AS total_tasks,
      (SELECT COUNT(*)::int FROM clients) AS total_clients,
      (SELECT ROUND(COALESCE(EXTRACT(EPOCH FROM SUM(te.duration)), 0) / 3600.0, 1)::float8
         FROM time_entries te WHERE can_view_user(${vid}, te.user_id)) AS total_hours,
      (SELECT ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM te.duration) / 3600.0 * u.hourly_rate), 0), 2)::float8
         FROM time_entries te JOIN users u ON u.id = te.user_id
         WHERE can_view_user(${vid}, te.user_id)) AS total_earned`);
  return [200, rows[0]];
});

const SUMMARY_SORTS = ['name', 'role', 'hourly_rate', 'projects', 'tasks', 'total_seconds', 'total_earned'];
route('GET', '/api/summary', async ({ viewer, query }) => {
  const sortBy = query.get('sortBy');
  const dir = query.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';
  const order = SUMMARY_SORTS.includes(sortBy) ? `ORDER BY "${sortBy}" ${dir}, "name"` : 'ORDER BY "name"';
  const { rows } = await pool.query(`
    SELECT * FROM (
      SELECT
        u.id, u.name, u.role, u.hourly_rate::float8 AS hourly_rate,
        (SELECT COUNT(DISTINCT t.project_id)::int FROM time_entries te
           JOIN tasks t ON t.id = te.task_id WHERE te.user_id = u.id) AS projects,
        (SELECT COUNT(DISTINCT te.task_id)::int FROM time_entries te WHERE te.user_id = u.id) AS tasks,
        COALESCE((SELECT ${secs('SUM(te.duration)')} FROM time_entries te WHERE te.user_id = u.id), 0) AS total_seconds,
        ROUND(COALESCE((SELECT EXTRACT(EPOCH FROM SUM(te.duration)) FROM time_entries te WHERE te.user_id = u.id), 0)
          / 3600.0 * u.hourly_rate, 2)::float8 AS total_earned
      FROM users u
      WHERE can_view_user($1, u.id)
    ) s ${order}`, [viewer.id]);
  return [200, rows];
});

route('GET', '/api/task-options', async () => {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, p.name AS project, tt.label AS task_type
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN task_types tt ON tt.id = t.task_type_id
    ORDER BY p.name, t.name`);
  return [200, rows];
});

route('GET', '/api/timers', async ({ viewer }) => {
  const { rows } = await pool.query(`
    SELECT rt.id, rt.user_id, u.name AS user_name, t.name AS task_name, p.name AS project_name,
      to_char(rt.started_at, 'YYYY-MM-DD HH24:MI:SS') AS started_at,
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP(0) - rt.started_at))), 0)::int AS elapsed_seconds
    FROM running_timers rt
    JOIN users u ON u.id = rt.user_id
    JOIN tasks t ON t.id = rt.task_id
    JOIN projects p ON p.id = t.project_id
    WHERE can_view_user($1, rt.user_id)
    ORDER BY rt.started_at`, [viewer.id]);
  return [200, rows];
});

route('POST', '/api/timers', async ({ viewer, body }) => {
  const taskId = toId(body.task_id);
  if (!taskId) throw new HttpError(400, 'Please choose a task.');
  const { rows } = await pool.query(
    'INSERT INTO running_timers (user_id, task_id) VALUES ($1, $2) RETURNING id',
    [viewer.id, taskId]);
  return [201, { id: rows[0].id }];
});

route('POST', '/api/timers/(\\d+)/stop', async ({ viewer, params }) => {
  // Only the owner can stop their timer. Saves an entry with the real start and end times.
  const { rows } = await pool.query(`
    WITH stopped AS (
      DELETE FROM running_timers
      WHERE id = $1 AND user_id = $2
      RETURNING task_id, started_at
    ), saved AS (
      INSERT INTO time_entries (user_id, task_id, started_at, ended_at)
      SELECT $2, s.task_id, s.started_at,
             GREATEST(LOCALTIMESTAMP(0), s.started_at + INTERVAL '1 second')
      FROM stopped s
      RETURNING started_at, ended_at, duration
    )
    SELECT to_char(started_at, 'YYYY-MM-DD HH24:MI:SS') AS started_at,
           to_char(ended_at, 'YYYY-MM-DD HH24:MI:SS') AS ended_at,
           FLOOR(EXTRACT(EPOCH FROM duration))::int AS seconds
    FROM saved`, [Number(params[0]), viewer.id]);
  if (!rows.length) throw new HttpError(404, 'Timer not found. It may already have been stopped.');
  return [200, rows[0]];
});

route('DELETE', '/api/timers/(\\d+)', async ({ viewer, params }) => {
  const r = await pool.query('DELETE FROM running_timers WHERE id = $1 AND user_id = $2',
    [Number(params[0]), viewer.id]);
  if (!r.rowCount) throw new HttpError(404, 'Timer not found.');
  return [200, { ok: true }];
});

route('POST', '/api/entries', async ({ viewer, body }) => {
  const taskId = toId(body.task_id);
  const start = sqlDateTime(body.start);
  const end = sqlDateTime(body.end);
  if (!taskId) throw new HttpError(400, 'Please choose a task.');
  if (!start || !end) throw new HttpError(400, 'Please provide a valid start and end time.');
  const { rows } = await pool.query(`
    INSERT INTO time_entries (user_id, task_id, started_at, ended_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, FLOOR(EXTRACT(EPOCH FROM duration))::int AS seconds`,
    [viewer.id, taskId, start, end]);
  return [201, rows[0]];
});

route('DELETE', '/api/entries/(\\d+)', async ({ viewer, params }) => {
  // Members can delete their own entries. Admins can delete any entry.
  const r = await pool.query(
    `DELETE FROM time_entries WHERE id = $1 AND (user_id = $2 OR $3 = 'admin')`,
    [Number(params[0]), viewer.id, viewer.role]);
  if (!r.rowCount) throw new HttpError(404, "Entry not found, or you don't have permission to delete it.");
  return [200, { ok: true }];
});

// ---------- HTTP server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e6) { reject(new HttpError(413, 'Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, url) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const body = req.method === 'POST' ? await readBody(req) : {};
    const viewer = r.open ? null : await getViewer(req);
    const [status, json] = await r.fn({ viewer, query: url.searchParams, body, params: m.slice(1) });
    return sendJson(res, status, json);
  }
  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(url, res) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(url, res);
  } catch (e) {
    const err = translateDbError(e);
    if (!(err instanceof HttpError)) console.error(e);
    sendJson(res, err.status || 500, {
      error: err instanceof HttpError ? err.message : 'Something went wrong. Check the server log.',
    });
  }
});

setupDatabase(process.argv.includes('--reset'))
  .then(() => server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Could not set up the database:', err.message);
    process.exit(1);
  });
