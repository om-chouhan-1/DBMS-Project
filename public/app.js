/* ===== Constants & state ===== */

const SETTINGS_KEY = 'dashboard_settings_v3';
const SIGNIN_KEY = 'signed_in_user_id';

const SUMMARY_TYPES = {
  name: 'text', role: 'text', hourly_rate: 'money', projects: 'text', tasks: 'text',
  total_seconds: 'seconds', total_earned: 'money',
};

const DEFAULT_SETTINGS = {
  version: 3,
  sections: [
    { id: 'overview', label: 'Overview', type: 'overview', visible: true },
    { id: 'summary', label: 'People summary', type: 'summary', visible: true,
      columns: ['name', 'role', 'projects', 'tasks', 'total_seconds', 'total_earned'], sortBy: '', sortOrder: 'asc' },
    { id: 'entries', label: 'Time entries', type: 'table', visible: true,
      columns: ['user', 'task', 'task_type', 'started_at', 'ended_at', 'duration', 'task_estimate'], sortBy: '', sortOrder: 'asc' },
    { id: 'tasks', label: 'Tasks', type: 'table', visible: false, columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'projects', label: 'Projects', type: 'table', visible: false, columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'users', label: 'Users', type: 'table', visible: false, columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'clients', label: 'Clients', type: 'table', visible: false, columns: [], sortBy: '', sortOrder: 'asc' },
  ],
};

let schema = {};            // table name -> [{ name, type }] from /api/schema
let settings = loadSettings();
let viewerId = localStorage.getItem(SIGNIN_KEY);
let flash = null;           // message shown after the next render: { kind, text }
let selectedTaskId = '';    // task picked in the dropdowns, kept across refreshes

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (raw && raw.version === DEFAULT_SETTINGS.version) return raw;
  } catch (_) {}
  return structuredClone(DEFAULT_SETTINGS);
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ===== API ===== */

async function api(method, url, body) {
  const opts = { method, headers: { 'X-User-Id': viewerId || '' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/* ===== Init ===== */

async function init() {
  try {
    const people = await fetch('/api/signin-options').then(r => r.json());
    populateSignin(people);
    schema = await api('GET', '/api/schema');
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<div class="error-box">Could not reach the server. Check that it is running and that PostgreSQL is reachable.<br><br>${esc(err.message)}</div>`;
    return;
  }

  // Drop saved columns that no longer exist in the schema
  for (const sec of settings.sections) {
    if (sec.type === 'table' && schema[sec.id]) {
      const valid = schema[sec.id].map(c => c.name);
      sec.columns = sec.columns.filter(c => valid.includes(c));
    }
  }
  saveSettings();

  setInterval(tickTimers, 1000);
  renderDrawer();
  await renderContent();
}

function populateSignin(people) {
  const select = document.getElementById('signinSelect');
  select.innerHTML = people.map(p =>
    `<option value="${p.id}">${esc(p.name)} (${esc(p.role)})</option>`).join('');
  if (!people.some(p => String(p.id) === String(viewerId))) viewerId = String(people[0].id);
  select.value = viewerId;
  localStorage.setItem(SIGNIN_KEY, viewerId);
  select.addEventListener('change', () => {
    viewerId = select.value;
    localStorage.setItem(SIGNIN_KEY, viewerId);
    selectedTaskId = '';
    flash = null;
    renderContent();
  });
}

/* ===== Drawer ===== */

function toggleDrawer() {
  document.getElementById('drawer').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}

function columnsFor(sec) {
  if (sec.type === 'summary') return Object.keys(SUMMARY_TYPES).map(name => ({ name, type: SUMMARY_TYPES[name] }));
  return schema[sec.id] || [];
}

function renderDrawer() {
  const body = document.getElementById('drawerBody');
  body.innerHTML = '';

  settings.sections.forEach((sec, i) => {
    const item = document.createElement('div');
    item.className = 'drawer-item';

    const hdr = document.createElement('div');
    hdr.className = 'drawer-item-header';
    hdr.innerHTML = `
      <label>
        <input type="checkbox" ${sec.visible ? 'checked' : ''} data-id="${sec.id}">
        ${esc(sec.label)}
      </label>
      <div class="move-btns">
        <button type="button" title="Move up" ${i === 0 ? 'disabled' : ''} data-move="${sec.id}" data-dir="-1">&#8593;</button>
        <button type="button" title="Move down" ${i === settings.sections.length - 1 ? 'disabled' : ''} data-move="${sec.id}" data-dir="1">&#8595;</button>
      </div>
      <button class="expand-btn" type="button" title="Columns and sorting">&#9656;</button>`;
    item.appendChild(hdr);

    if (sec.type === 'table' || sec.type === 'summary') {
      const det = document.createElement('div');
      det.className = 'drawer-details';
      const cols = columnsFor(sec);
      let html = '<div class="detail-label">Columns</div><div class="col-toggles">';
      cols.forEach(c => {
        const checked = sec.columns.includes(c.name) ? 'checked' : '';
        html += `<label><input type="checkbox" ${checked} data-col="${sec.id}" data-name="${c.name}">${esc(headerLabel(c.name))}</label>`;
      });
      html += '</div><div class="detail-label">Sort</div><div class="sort-row">';
      html += `<select data-sort="${sec.id}"><option value="">None</option>`;
      cols.forEach(c => {
        html += `<option value="${c.name}" ${sec.sortBy === c.name ? 'selected' : ''}>${esc(headerLabel(c.name))}</option>`;
      });
      html += `</select><select data-order="${sec.id}">
        <option value="asc" ${sec.sortOrder === 'asc' ? 'selected' : ''}>Ascending</option>
        <option value="desc" ${sec.sortOrder === 'desc' ? 'selected' : ''}>Descending</option>
      </select></div>`;
      det.innerHTML = html;
      item.appendChild(det);

      hdr.querySelector('.expand-btn').addEventListener('click', e => {
        const open = det.classList.toggle('open');
        e.currentTarget.innerHTML = open ? '&#9662;' : '&#9656;';
      });
    }
    body.appendChild(item);
  });
}

// One set of listeners for the whole drawer
document.getElementById('drawerBody').addEventListener('change', e => {
  const t = e.target;
  const sec = t.dataset.id ? settings.sections.find(s => s.id === t.dataset.id)
    : t.dataset.col ? settings.sections.find(s => s.id === t.dataset.col)
    : t.dataset.sort ? settings.sections.find(s => s.id === t.dataset.sort)
    : t.dataset.order ? settings.sections.find(s => s.id === t.dataset.order)
    : null;
  if (!sec) return;
  if (t.dataset.id) sec.visible = t.checked;
  if (t.dataset.col) {
    sec.columns = t.checked
      ? [...new Set([...sec.columns, t.dataset.name])]
      : sec.columns.filter(c => c !== t.dataset.name);
  }
  if (t.dataset.sort) sec.sortBy = t.value;
  if (t.dataset.order) sec.sortOrder = t.value;
  saveSettings();
  renderContent();
});

document.getElementById('drawerBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-move]');
  if (!btn) return;
  const idx = settings.sections.findIndex(s => s.id === btn.dataset.move);
  const to = idx + Number(btn.dataset.dir);
  if (to < 0 || to >= settings.sections.length) return;
  [settings.sections[idx], settings.sections[to]] = [settings.sections[to], settings.sections[idx]];
  saveSettings();
  renderDrawer();
  renderContent();
});

/* ===== Content ===== */

let renderToken = 0;

async function renderContent() {
  const token = ++renderToken;
  const frag = document.createDocumentFragment();

  for (const sec of settings.sections) {
    if (!sec.visible) continue;
    try {
      if (sec.type === 'overview') await renderOverview(frag);
      else if (sec.type === 'summary') await renderSummary(frag, sec);
      else if (sec.id === 'entries') await renderEntries(frag, sec);
      else await renderTable(frag, sec);
    } catch (err) {
      const div = document.createElement('div');
      div.className = 'error-box';
      div.textContent = `Could not load ${sec.label}: ${err.message}`;
      frag.appendChild(div);
    }
  }

  if (token !== renderToken) return;
  const main = document.getElementById('content');
  if (!frag.childNodes.length) {
    main.innerHTML = '<p class="empty-msg">No sections are shown. Click <b>Configure</b> to choose what to display.</p>';
    return;
  }
  main.replaceChildren(frag);
}

async function renderOverview(container) {
  const d = await api('GET', '/api/overview');
  const section = document.createElement('section');
  section.className = 'data-section';
  section.innerHTML = `
    <div class="overview-grid">
      ${statCard('Users you can see', d.total_users)}
      ${statCard('Projects', d.total_projects)}
      ${statCard('Tasks', d.total_tasks)}
      ${statCard('Clients', d.total_clients)}
      ${statCard('Hours you can see', fmtHours(d.total_hours))}
      ${statCard('Earnings you can see', fmtMoney(d.total_earned))}
    </div>`;
  container.appendChild(section);
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div>`;
}

async function renderSummary(container, sec) {
  const params = new URLSearchParams();
  if (sec.sortBy) params.set('sortBy', sec.sortBy);
  if (sec.sortOrder) params.set('sortOrder', sec.sortOrder);
  const rows = await api('GET', '/api/summary?' + params);
  const cols = (sec.columns.length ? sec.columns : Object.keys(SUMMARY_TYPES))
    .map(name => ({ name, type: SUMMARY_TYPES[name] }));
  container.appendChild(sectionWithTable(sec.label, cols, rows));
}

async function renderTable(container, sec) {
  const cols = sec.columns.length ? sec.columns : (schema[sec.id] || []).map(c => c.name);
  const params = new URLSearchParams({ columns: cols.join(',') });
  if (sec.sortBy) params.set('sortBy', sec.sortBy);
  if (sec.sortOrder) params.set('sortOrder', sec.sortOrder);
  const rows = await api('GET', `/api/data/${sec.id}?${params}`);
  const typed = cols.map(name => ({ name, type: typeOf(sec.id, name) }));
  container.appendChild(sectionWithTable(sec.label, typed, rows));
}

function typeOf(table, name) {
  const col = (schema[table] || []).find(c => c.name === name);
  return col ? col.type : 'text';
}

/* ===== Time entries: timers, manual entries, delete ===== */

function showMessage(kind, text) {
  const box = document.getElementById('trackerMsg');
  if (!box) return;
  box.className = kind === 'error' ? 'error-box' : 'ok-box';
  box.textContent = text;
  box.hidden = false;
}

// Runs an action, then refreshes. Buttons are locked meanwhile so nothing is double-submitted.
async function runAction(fn) {
  const buttons = [...document.querySelectorAll('.entries-section button')];
  buttons.forEach(b => { b.disabled = true; });
  try {
    await fn();
    await renderContent();
  } catch (err) {
    buttons.forEach(b => { if (b.isConnected) b.disabled = false; });
    showMessage('error', err.message);
  }
}

async function renderEntries(container, sec) {
  const allCols = (schema.entries || []).map(c => c.name);
  const cols = sec.columns.length ? sec.columns : allCols;
  // Always fetch the id so rows can be deleted; it is not displayed unless chosen.
  const params = new URLSearchParams({ columns: ['id', ...cols].join(',') });
  if (sec.sortBy) params.set('sortBy', sec.sortBy);
  if (sec.sortOrder) params.set('sortOrder', sec.sortOrder);
  const rows = await api('GET', `/api/data/entries?${params}`);

  let timers = [], tasks = [], trackerError = null;
  try {
    [timers, tasks] = await Promise.all([api('GET', '/api/timers'), api('GET', '/api/task-options')]);
  } catch (err) {
    trackerError = err.message;
  }

  const typed = cols.map(name => ({ name, type: typeOf('entries', name) }));
  const section = sectionWithTable(sec.label, typed, rows, {
    action: row => `<button type="button" class="btn btn-danger" data-delete="${row.id}">Delete</button>`,
  });
  section.classList.add('entries-section');

  const frag = document.createDocumentFragment();
  const msg = document.createElement('div');
  msg.id = 'trackerMsg';
  msg.hidden = true;
  frag.appendChild(msg);
  if (flash) {
    msg.className = flash.kind === 'error' ? 'error-box' : 'ok-box';
    msg.textContent = flash.text;
    msg.hidden = false;
    flash = null;
  }

  if (trackerError) {
    const err = document.createElement('div');
    err.className = 'error-box';
    err.textContent = 'Timer and entry controls are unavailable: ' + trackerError;
    frag.appendChild(err);
  } else {
    frag.appendChild(buildTrackerControls(tasks));
    if (timers.length) frag.appendChild(buildTimerList(timers));
  }
  section.querySelector('h2').after(frag);

  // Delete buttons (event delegation, one listener)
  section.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const row = rows.find(r => String(r.id) === btn.dataset.delete);
    const label = row ? `${row.task} on ${row.started_at}` : 'this entry';
    if (!confirm(`Delete ${label}?\n\nThis cannot be undone.`)) return;
    runAction(async () => {
      await api('DELETE', `/api/entries/${btn.dataset.delete}`);
      flash = { kind: 'ok', text: 'Entry deleted.' };
    });
  });

  container.appendChild(section);
}

function taskOptionsHtml(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const g = t.project || 'No project';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  let html = '';
  for (const [project, list] of groups) {
    html += `<optgroup label="${esc(project)}">`;
    html += list.map(t => {
      const sel = String(t.id) === String(selectedTaskId) ? ' selected' : '';
      return `<option value="${t.id}"${sel}>${esc(t.name)} · ${esc(t.task_type)}</option>`;
    }).join('');
    html += '</optgroup>';
  }
  return html;
}

function buildTrackerControls(tasks) {
  const box = document.createElement('div');
  box.className = 'tracker-controls';

  if (!tasks.length) {
    box.innerHTML = '<p class="empty-msg">There are no tasks yet, so there is nothing to track.</p>';
    return box;
  }

  const options = taskOptionsHtml(tasks);
  box.innerHTML = `
    <div class="tracker-bar">
      <select id="timerTask" aria-label="Task to track">${options}</select>
      <button type="button" class="btn btn-primary" id="startTimerBtn">&#9654; Start timer</button>
      <button type="button" class="btn" id="toggleManualBtn">+ Add past entry</button>
    </div>
    <form class="manual-form" id="manualForm" hidden>
      <label>Task
        <select id="manualTask">${options}</select>
      </label>
      <label>Started
        <input type="datetime-local" id="manualStart" required>
      </label>
      <label>Ended
        <input type="datetime-local" id="manualEnd" required>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Add entry</button>
        <button type="button" class="btn" id="cancelManualBtn">Cancel</button>
      </div>
    </form>`;

  const timerTask = box.querySelector('#timerTask');
  const manualTask = box.querySelector('#manualTask');
  const form = box.querySelector('#manualForm');

  if (!selectedTaskId || !tasks.some(t => String(t.id) === String(selectedTaskId))) {
    selectedTaskId = String(tasks[0].id);
  }
  timerTask.value = manualTask.value = selectedTaskId;
  const onTaskChange = e => {
    selectedTaskId = e.target.value;
    timerTask.value = manualTask.value = selectedTaskId;
  };
  timerTask.addEventListener('change', onTaskChange);
  manualTask.addEventListener('change', onTaskChange);

  box.querySelector('#startTimerBtn').addEventListener('click', () => {
    runAction(async () => {
      await api('POST', '/api/timers', { task_id: Number(timerTask.value) });
      flash = { kind: 'ok', text: 'Timer started. Press Stop when you finish.' };
    });
  });

  box.querySelector('#toggleManualBtn').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      const now = new Date();
      box.querySelector('#manualEnd').value = toLocalInputValue(now);
      box.querySelector('#manualStart').value = toLocalInputValue(new Date(now.getTime() - 60 * 60 * 1000));
      manualTask.value = selectedTaskId;
    }
  });
  box.querySelector('#cancelManualBtn').addEventListener('click', () => { form.hidden = true; });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const start = box.querySelector('#manualStart').value;
    const end = box.querySelector('#manualEnd').value;
    if (!start || !end) return showMessage('error', 'Please fill in both the start and end time.');
    if (end <= start) return showMessage('error', 'End time must be after the start time.');
    runAction(async () => {
      const r = await api('POST', '/api/entries', { task_id: Number(manualTask.value), start, end });
      flash = { kind: 'ok', text: `Entry added (${fmtHms(r.seconds)}).` };
    });
  });

  return box;
}

function buildTimerList(timers) {
  const list = document.createElement('div');
  list.className = 'timer-list';
  const fetchedAt = Date.now();

  timers.forEach(t => {
    const row = document.createElement('div');
    row.className = 'timer-row';
    row.innerHTML = `
      <span class="timer-dot" title="Running"></span>
      <div class="timer-info">
        <div class="timer-task">${esc(t.task_name)}</div>
        <div class="timer-meta">${esc(t.user_name)} &middot; ${esc(t.project_name || '')} &middot; started ${esc(t.started_at)}</div>
      </div>
      <div class="timer-clock" data-elapsed="${Number(t.elapsed_seconds) || 0}" data-fetched="${fetchedAt}">${fmtHms(t.elapsed_seconds)}</div>
      <button type="button" class="btn btn-stop">&#9632; Stop</button>
      <button type="button" class="btn btn-quiet">Discard</button>`;

    const mine = String(t.user_id) === String(viewerId);
    if (!mine) {
      // Other people's timers are visible only to admins, and can be watched but not changed here.
      row.querySelectorAll('button').forEach(b => { b.hidden = true; });
    }

    row.querySelector('.btn-stop').addEventListener('click', () => {
      runAction(async () => {
        const r = await api('POST', `/api/timers/${t.id}/stop`);
        flash = { kind: 'ok', text: `Timer stopped. Saved ${fmtHms(r.seconds)} on “${t.task_name}”.` };
      });
    });

    row.querySelector('.btn-quiet').addEventListener('click', () => {
      if (!confirm('Discard this running timer without saving an entry?')) return;
      runAction(async () => {
        await api('DELETE', `/api/timers/${t.id}`);
        flash = { kind: 'ok', text: 'Timer discarded.' };
      });
    });

    list.appendChild(row);
  });
  return list;
}

// Updates running clocks once a second, without calling the server
function tickTimers() {
  document.querySelectorAll('.timer-clock').forEach(el => {
    const base = Number(el.dataset.elapsed);
    const fetchedAt = Number(el.dataset.fetched);
    el.textContent = fmtHms(base + (Date.now() - fetchedAt) / 1000);
  });
}

/* ===== Table & formatting helpers ===== */

// Builds a titled section containing a table. opts.action(row) returns HTML for an extra last column.
function sectionWithTable(title, columns, rows, opts = {}) {
  const section = document.createElement('section');
  section.className = 'data-section';
  section.innerHTML = `<h2>${esc(title)}</h2>`;

  if (!rows.length) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.innerHTML = '<p class="empty-msg">No records to show.</p>';
    section.appendChild(wrap);
    return section;
  }

  const head = columns.map(c => `<th>${esc(headerLabel(c.name))}</th>`).join('') + (opts.action ? '<th></th>' : '');
  const body = rows.map(row => {
    const cells = columns.map(c => {
      const num = c.type === 'seconds' || c.type === 'money' || c.type === 'int' ? ' class="num"' : '';
      return `<td${num}>${esc(fmtCell(row[c.name], c.type))}</td>`;
    }).join('');
    const action = opts.action ? `<td class="row-actions">${opts.action(row)}</td>` : '';
    return `<tr>${cells}${action}</tr>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  section.appendChild(wrap);
  return section;
}

function fmtCell(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'seconds': return fmtHms(value);
    case 'money': return fmtMoney(value);
    case 'bool': return value ? 'Done' : 'Open';
    default: return String(value);
  }
}

// Seconds -> "hh:mm:ss". Hours can go past 24, which is fine for totals.
function fmtHms(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function fmtHours(h) {
  return `${Number(h || 0).toFixed(1)} h`;
}

function fmtMoney(v) {
  return '$' + Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function headerLabel(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toLocalInputValue(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function esc(val) {
  return String(val === null || val === undefined ? '' : val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ===== Start ===== */
init();
