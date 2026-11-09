/**
 * Workspace Dashboard — SQLite edition (zero dependencies).
 * Needs only Node.js >= 22.13 (uses the built-in node:sqlite module).
 *
 *   node server.js          -> http://localhost:3000
 *   PORT=4000 node server.js
 *   node server.js --reset  -> delete the database and re-seed it
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'dbms_project.db');

if (process.argv.includes('--reset')) {
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });
  console.log('Database deleted; it will be re-created.');
}

// ---------- Database setup (schema + seed on first run) ----------
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf-8'));
if (db.prepare('SELECT COUNT(*) AS n FROM Workspace').get().n === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf-8'));
  console.log('Sample data inserted.');
}

// ---------- Formatting helpers (SQLite stores seconds / 0-1) ----------
const pad = n => String(n).padStart(2, '0');
function fmtInterval(sec) {            // 5400 -> "01:30:00"
  if (sec === null || sec === undefined) return null;
  sec = Math.round(Number(sec));
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
}
function parseInterval(text) {         // "01:30:00" -> 5400
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(text).trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
const FORMATTERS = {
  interval: fmtInterval,
  bool: v => (v === null || v === undefined ? null : v ? 't' : 'f'),
  text: v => (v === null || v === undefined ? null : String(v)),
};

// ---------- Table config: display columns with FK names resolved ----------
// expr: [sql expression, type]
const TABLE_CONFIG = {
  workspace: {
    columns: ['workspace_id', 'workspace_name'],
    from: 'workspace',
    expr: {
      workspace_id:   ['workspace.workspace_id', 'text'],
      workspace_name: ['workspace.workspace_name', 'text'],
    },
  },
  users: {
    columns: ['u_id', 'u_name', 'email', 'joining_time', 'user_wage', 'workspace'],
    from: 'users LEFT JOIN workspace w ON users.workspace_id = w.workspace_id',
    expr: {
      u_id:         ['users.u_id', 'text'],
      u_name:       ['users.u_name', 'text'],
      email:        ['users.email', 'text'],
      joining_time: ['users.joining_time', 'text'],
      user_wage:    ['users.user_wage', 'text'],
      workspace:    ['w.workspace_name', 'text'],
    },
  },
  clients: {
    columns: ['client_id', 'client_name', 'client_email', 'workspace'],
    from: 'clients LEFT JOIN workspace w ON clients.workspace_id = w.workspace_id',
    expr: {
      client_id:    ['clients.client_id', 'text'],
      client_name:  ['clients.client_name', 'text'],
      client_email: ['clients.client_email', 'text'],
      workspace:    ['w.workspace_name', 'text'],
    },
  },
  projects: {
    columns: ['project_id', 'project_name', 'user_name', 'client_name', 'project_duration_worked', 'project_rate'],
    from: 'projects LEFT JOIN users u ON projects.u_id = u.u_id LEFT JOIN clients c ON projects.client_id = c.client_id',
    expr: {
      project_id:              ['projects.project_id', 'text'],
      project_name:            ['projects.project_name', 'text'],
      user_name:               ['u.u_name', 'text'],
      client_name:             ['c.client_name', 'text'],
      project_duration_worked: ['projects.project_duration_worked', 'interval'],
      project_rate:            ['projects.project_rate', 'text'],
    },
  },
  tasks: {
    columns: ['task_id', 'task_name', 'project_name', 'task_duration', 'task_start_time', 'status'],
    from: 'tasks LEFT JOIN projects p ON tasks.project_id = p.project_id',
    expr: {
      task_id:         ['tasks.task_id', 'text'],
      task_name:       ['tasks.task_name', 'text'],
      project_name:    ['p.project_name', 'text'],
      task_duration:   ['tasks.task_duration', 'interval'],
      task_start_time: ['tasks.task_start_time', 'text'],
      status:          ['tasks.status', 'bool'],
    },
  },
  entries: {
    columns: ['timer_start', 'task_name', 'project_name', 'task_duration', 'task_start_time', 'timer_duration'],
    from: 'entries LEFT JOIN projects p ON entries.project_id = p.project_id LEFT JOIN tasks t ON entries.task_id = t.task_id',
    expr: {
      timer_start:     ['entries.timer_start', 'text'],
      task_name:       ['t.task_name', 'text'],
      project_name:    ['p.project_name', 'text'],
      task_duration:   ['entries.task_duration', 'interval'],
      task_start_time: ['entries.task_start_time', 'text'],
      timer_duration:  ['entries.timer_duration', 'interval'],
    },
  },
};

// ---------- Validation helpers ----------
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const MAX_MANUAL_ENTRY_S = 24 * 60 * 60;

function isRealDateTime(v) {
  const [, y, mo, d, h, mi, s] = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d &&
         dt.getUTCHours() === h && dt.getUTCMinutes() === mi && dt.getUTCSeconds() === s;
}
function normalizeDateTime(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!DATETIME_RE.test(v)) return null;
  const spaced = v.replace('T', ' ');
  const full = spaced.length === 16 ? spaced + ':00' : spaced;
  return isRealDateTime(full) ? full : null;
}
const toSec = n => Date.parse(n.replace(' ', 'T') + 'Z') / 1000;
function toId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function translateDbError(err) {
  const msg = String(err.message || '');
  if (/UNIQUE constraint failed: Entries|PRIMARY KEY/i.test(msg) && /Entries/i.test(msg))
    return new HttpError(409, 'An entry with the same start time and duration already exists.');
  if (/UNIQUE constraint failed: Active_Timers/i.test(msg))
    return new HttpError(409, 'A timer is already running for this task.');
  if (/FOREIGN KEY/i.test(msg)) return new HttpError(400, 'That task does not exist.');
  return err;
}

const NOW_LOCAL = `datetime('now','localtime')`;

// ---------- API handlers: (query, body, params) -> [status, json] ----------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern + '$'), fn });

route('GET', '/api/schema', () => {
  const schema = {};
  for (const [t, cfg] of Object.entries(TABLE_CONFIG)) schema[t] = cfg.columns;
  return [200, schema];
});

route('GET', '/api/data/([a-z_]+)', ({ query, params }) => {
  const table = params[0].toLowerCase();
  const cfg = TABLE_CONFIG[table];
  if (!cfg) throw new HttpError(400, 'Invalid table');

  let cols = cfg.columns;
  if (query.get('columns')) {
    const requested = query.get('columns').split(',').filter(c => cfg.columns.includes(c));
    if (requested.length > 0) cols = requested;
  }
  const selectList = cols.map(c => `${cfg.expr[c][0]} AS "${c}"`).join(', ');

  let orderClause = '';
  const sortBy = query.get('sortBy');
  if (sortBy && cfg.columns.includes(sortBy)) {
    const dir = query.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';
    orderClause = ` ORDER BY ${cfg.expr[sortBy][0]} ${dir}`;
  }
  let extra = '';
  if (table === 'entries') {
    extra = `, entries.timer_start AS "_ts", entries.timer_duration AS "_td"`;
    if (!orderClause) orderClause = ' ORDER BY entries.timer_start DESC';
  }

  const rows = db.prepare(`SELECT ${selectList}${extra} FROM ${cfg.from}${orderClause}`).all();
  return [200, rows.map(r => {
    const o = {};
    for (const c of cols) o[c] = FORMATTERS[cfg.expr[c][1]](r[c]);
    if (table === 'entries') { o._ts = r._ts; o._td = fmtInterval(r._td); }
    return o;
  })];
});

route('GET', '/api/overview', () => {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users)    AS total_users,
      (SELECT COUNT(*) FROM projects) AS total_projects,
      (SELECT COUNT(*) FROM tasks)    AS total_tasks,
      (SELECT COUNT(*) FROM clients)  AS total_clients,
      COALESCE(ROUND(SUM(e.timer_duration) / 3600.0, 1), 0) AS total_hours,
      COALESCE(ROUND(SUM(e.timer_duration / 3600.0 *
        (SELECT user_wage FROM users WHERE u_id = p.u_id)), 2), 0) AS total_earned
    FROM entries e
    JOIN projects p ON e.project_id = p.project_id
  `).get();
  return [200, { ...row }];
});

route('GET', '/api/summary', ({ query }) => {
  const validCols = ['u_id', 'name', 'email', 'wage', 'total_projects', 'total_tasks', 'total_hours', 'total_earned'];
  const colMap = {
    u_id: 'u.u_id', name: 'u.u_name', email: 'u.email', wage: 'u.user_wage',
    total_projects: 'total_projects', total_tasks: 'total_tasks',
    total_hours: 'total_hours', total_earned: 'total_earned',
  };
  let orderClause = 'ORDER BY u.u_name';
  const sortBy = query.get('sortBy');
  if (sortBy && validCols.includes(sortBy)) {
    const dir = query.get('sortOrder') === 'desc' ? 'DESC' : 'ASC';
    orderClause = `ORDER BY ${colMap[sortBy]} ${dir}`;
  }
  // Hours/earnings are summed over DISTINCT entries via a subquery so that the
  // joins above do not multiply them.
  const rows = db.prepare(`
    SELECT
      u.u_id,
      u.u_name   AS name,
      u.email,
      u.user_wage AS wage,
      (SELECT COUNT(*) FROM projects p WHERE p.u_id = u.u_id) AS total_projects,
      (SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.project_id
        WHERE p.u_id = u.u_id) AS total_tasks,
      COALESCE(ROUND((SELECT SUM(e.timer_duration) FROM entries e JOIN tasks t ON e.task_id = t.task_id
        JOIN projects p ON t.project_id = p.project_id WHERE p.u_id = u.u_id) / 3600.0, 1), 0) AS total_hours,
      COALESCE(ROUND((SELECT SUM(e.timer_duration) FROM entries e JOIN tasks t ON e.task_id = t.task_id
        JOIN projects p ON t.project_id = p.project_id WHERE p.u_id = u.u_id) / 3600.0 * u.user_wage, 2), 0) AS total_earned
    FROM users u
    ${orderClause}
  `).all();
  return [200, rows.map(r => ({ ...r }))];
});

route('GET', '/api/tracker/tasks', () => {
  const rows = db.prepare(`
    SELECT t.task_id, t.task_name, t.project_id, p.project_name
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.project_id
    ORDER BY p.project_name, t.task_name, t.task_id
  `).all();
  return [200, rows.map(r => ({ ...r }))];
});

route('GET', '/api/timers', () => {
  const rows = db.prepare(`
    SELECT a.timer_id, a.task_id, t.task_name, p.project_name,
           a.started_at AS started_at,
           MAX(CAST(strftime('%s', ${NOW_LOCAL}) AS INTEGER) - CAST(strftime('%s', a.started_at) AS INTEGER), 0) AS elapsed_seconds
    FROM active_timers a
    JOIN tasks t ON t.task_id = a.task_id
    LEFT JOIN projects p ON p.project_id = t.project_id
    ORDER BY a.started_at
  `).all();
  return [200, rows.map(r => ({ ...r }))];
});

route('POST', '/api/timers', ({ body }) => {
  const taskId = toId(body && body.task_id);
  if (!taskId) throw new HttpError(400, 'Please choose a task.');
  if (!db.prepare('SELECT 1 FROM tasks WHERE task_id = ?').get(taskId))
    throw new HttpError(404, 'That task does not exist.');
  const r = db.prepare(`INSERT INTO active_timers (task_id, started_at) VALUES (?, ${NOW_LOCAL})`).run(taskId);
  return [201, { timer_id: Number(r.lastInsertRowid) }];
});

route('POST', '/api/timers/(\\d+)/stop', ({ params }) => {
  const id = toId(params[0]);
  if (!id) throw new HttpError(400, 'Invalid timer id.');
  db.exec('BEGIN');
  try {
    const timer = db.prepare(`
      SELECT task_id, started_at,
             MAX(CAST(strftime('%s', ${NOW_LOCAL}) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER), 1) AS duration
      FROM active_timers WHERE timer_id = ?`).get(id);
    if (!timer) throw new HttpError(404, 'Timer not found. It may already have been stopped.');
    const ins = db.prepare(`
      INSERT INTO entries (timer_start, task_duration, project_id, task_start_time, timer_duration, task_id)
      SELECT ?, t.task_duration, t.project_id, t.task_start_time, ?, t.task_id FROM tasks t WHERE t.task_id = ?
    `).run(timer.started_at, timer.duration, timer.task_id);
    if (ins.changes === 0) throw new HttpError(404, 'The task for this timer no longer exists.');
    db.prepare('DELETE FROM active_timers WHERE timer_id = ?').run(id);
    db.exec('COMMIT');
    return [200, { timer_start: timer.started_at, timer_duration: fmtInterval(timer.duration) }];
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

route('DELETE', '/api/timers/(\\d+)', ({ params }) => {
  const id = toId(params[0]);
  if (!id) throw new HttpError(400, 'Invalid timer id.');
  const r = db.prepare('DELETE FROM active_timers WHERE timer_id = ?').run(id);
  if (r.changes === 0) throw new HttpError(404, 'Timer not found.');
  return [200, { ok: true }];
});

route('POST', '/api/entries', ({ body }) => {
  body = body || {};
  const taskId = toId(body.task_id);
  const start = normalizeDateTime(body.start);
  const end = normalizeDateTime(body.end);
  if (!taskId) throw new HttpError(400, 'Please choose a task.');
  if (!start || !end) throw new HttpError(400, 'Please provide a valid start and end time.');
  const diff = toSec(end) - toSec(start);
  if (Number.isNaN(diff)) throw new HttpError(400, 'Invalid date or time.');
  if (diff <= 0) throw new HttpError(400, 'End time must be after the start time.');
  if (diff > MAX_MANUAL_ENTRY_S)
    throw new HttpError(400, 'A single entry cannot be longer than 24 hours. Split it into several entries.');
  const r = db.prepare(`
    INSERT INTO entries (timer_start, task_duration, project_id, task_start_time, timer_duration, task_id)
    SELECT ?, t.task_duration, t.project_id, t.task_start_time, ?, t.task_id FROM tasks t WHERE t.task_id = ?
  `).run(start, diff, taskId);
  if (r.changes === 0) throw new HttpError(404, 'That task does not exist.');
  return [201, { timer_start: start, timer_duration: fmtInterval(diff) }];
});

route('DELETE', '/api/entries', ({ query }) => {
  const ts = query.get('timer_start');
  const td = parseInterval(query.get('timer_duration'));
  if (!ts || ts.length > 40 || td === null)
    throw new HttpError(400, 'timer_start and timer_duration are required.');
  const r = db.prepare('DELETE FROM entries WHERE timer_start = ? AND timer_duration = ?').run(ts, td);
  if (r.changes === 0) throw new HttpError(404, 'Entry not found. It may already have been deleted.');
  return [200, { ok: true }];
});

// ---------- HTTP server + static files ----------
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new HttpError(413, 'Body too large')); req.destroy(); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
        try {
          const [status, json] = r.fn({ query: url.searchParams, body, params: m.slice(1) });
          return sendJson(res, status, json);
        } catch (e) { throw translateDbError(e); }
      }
      return sendJson(res, 404, { error: 'Not found' });
    }
    // static files
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}  (database: ${DB_FILE})`));
