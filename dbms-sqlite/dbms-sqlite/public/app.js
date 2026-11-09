/* ===== State ===== */

const SUMMARY_COLS = ['name','email','wage','total_projects','total_tasks','total_hours','total_earned'];

const DEFAULT_SETTINGS = {
  version: 2,
  sections: [
    { id: 'overview',  label: 'Overview',      visible: true,  type: 'overview' },
    { id: 'summary',   label: 'User Summary',  visible: true,  type: 'summary',
      columns: ['name','total_projects','total_tasks','total_hours','total_earned'],
      sortBy: '', sortOrder: 'asc' },
    { id: 'users',     label: 'Users',     visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'clients',   label: 'Clients',   visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'projects',  label: 'Projects',  visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'tasks',     label: 'Tasks',     visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'workspace', label: 'Workspace', visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
    { id: 'entries',   label: 'Entries',   visible: true,  type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
  ]
};

let schema = {};
let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem('dashboard_settings');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettings() {
  localStorage.setItem('dashboard_settings', JSON.stringify(settings));
}

/* ===== Init ===== */

async function init() {
  try {
    const res = await fetch('/api/schema');
    if (!res.ok) throw new Error('Could not load schema');
    schema = await res.json();
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<div class="error-box">Failed to connect to server. Make sure the server is running and PostgreSQL is accessible.<br><br>${err.message}</div>`;
    return;
  }

  // Ensure every table section has valid columns from the current schema
  for (const sec of settings.sections) {
    if (sec.type === 'table' && schema[sec.id]) {
      const valid = schema[sec.id];
      // Drop any saved columns that no longer exist in the schema
      sec.columns = sec.columns.filter(c => valid.includes(c));
      // If empty (first run or all stale), show all
      if (sec.columns.length === 0) sec.columns = [...valid];
    }
  }
  // One-time migration: the Entries section now holds the timer / add / delete
  // controls, so make it visible for people who already have saved settings.
  if (!settings.version || settings.version < 2) {
    const entriesSec = settings.sections.find(s => s.id === 'entries');
    if (entriesSec) entriesSec.visible = true;
    settings.version = 2;
  }
  saveSettings();

  setInterval(tickTimers, 1000);
  renderDrawer();
  await renderContent();
}

/* ===== Drawer ===== */

function toggleDrawer() {
  document.getElementById('drawer').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}

function renderDrawer() {
  const body = document.getElementById('drawerBody');
  body.innerHTML = '';

  settings.sections.forEach((sec, i) => {
    const item = document.createElement('div');
    item.className = 'drawer-item';

    // Header row
    const hdr = document.createElement('div');
    hdr.className = 'drawer-item-header';
    hdr.innerHTML = `
      <label>
        <input type="checkbox" ${sec.visible ? 'checked' : ''}
               data-id="${sec.id}" onchange="onToggleSection(this)">
        ${sec.label}
      </label>
      <div class="move-btns">
        <button title="Move up" ${i === 0 ? 'disabled' : ''}
                onclick="onMove('${sec.id}',-1)">&#8593;</button>
        <button title="Move down" ${i === settings.sections.length - 1 ? 'disabled' : ''}
                onclick="onMove('${sec.id}',1)">&#8595;</button>
      </div>
      <button class="expand-btn" onclick="onExpand(this)"
              title="Column &amp; sort settings">&#9656;</button>
    `;
    item.appendChild(hdr);

    // Details (columns + sort) — only for table / summary sections
    if (sec.type === 'table' || sec.type === 'summary') {
      const det = document.createElement('div');
      det.className = 'drawer-details';

      const allCols = sec.type === 'table' ? (schema[sec.id] || []) : SUMMARY_COLS;

      let html = '<div class="detail-label">Columns</div><div class="col-toggles">';
      allCols.forEach(c => {
        const checked = sec.columns.includes(c) ? 'checked' : '';
        html += `<label><input type="checkbox" ${checked}
                  onchange="onToggleCol('${sec.id}','${c}',this.checked)">${formatHeader(c)}</label>`;
      });
      html += '</div>';

      html += '<div class="detail-label">Sort</div><div class="sort-row">';
      html += `<select onchange="onSortBy('${sec.id}',this.value)"><option value="">None</option>`;
      allCols.forEach(c => {
        html += `<option value="${c}" ${sec.sortBy === c ? 'selected' : ''}>${formatHeader(c)}</option>`;
      });
      html += `</select>`;
      html += `<select onchange="onSortOrder('${sec.id}',this.value)">
        <option value="asc" ${sec.sortOrder === 'asc' ? 'selected' : ''}>Asc</option>
        <option value="desc" ${sec.sortOrder === 'desc' ? 'selected' : ''}>Desc</option>
      </select></div>`;

      det.innerHTML = html;
      item.appendChild(det);
    }

    body.appendChild(item);
  });
}

/* ===== Drawer Callbacks ===== */

function onToggleSection(el) {
  const sec = settings.sections.find(s => s.id === el.dataset.id);
  sec.visible = el.checked;
  saveSettings();
  renderContent();
}

function onMove(id, dir) {
  const idx = settings.sections.findIndex(s => s.id === id);
  const to = idx + dir;
  if (to < 0 || to >= settings.sections.length) return;
  [settings.sections[idx], settings.sections[to]] = [settings.sections[to], settings.sections[idx]];
  saveSettings();
  renderDrawer();
  renderContent();
}

function onExpand(btn) {
  const details = btn.closest('.drawer-item').querySelector('.drawer-details');
  if (!details) return;
  const open = details.classList.toggle('open');
  btn.innerHTML = open ? '&#9662;' : '&#9656;';
}

function onToggleCol(secId, col, checked) {
  const sec = settings.sections.find(s => s.id === secId);
  if (checked) {
    if (!sec.columns.includes(col)) sec.columns.push(col);
  } else {
    sec.columns = sec.columns.filter(c => c !== col);
  }
  saveSettings();
  renderContent();
}

function onSortBy(secId, val) {
  const sec = settings.sections.find(s => s.id === secId);
  sec.sortBy = val;
  saveSettings();
  renderContent();
}

function onSortOrder(secId, val) {
  const sec = settings.sections.find(s => s.id === secId);
  sec.sortOrder = val;
  saveSettings();
  renderContent();
}

/* ===== Content Rendering ===== */

let renderToken = 0;

async function renderContent() {
  // Build into a fragment so quick successive actions (start, stop, delete)
  // can't interleave; only the most recent render is put on screen.
  const token = ++renderToken;
  const frag = document.createDocumentFragment();

  for (const sec of settings.sections) {
    if (!sec.visible) continue;
    try {
      if (sec.type === 'overview') await renderOverview(frag);
      else if (sec.type === 'summary') await renderSummary(frag, sec);
      else if (sec.type === 'table')   await renderTable(frag, sec);
    } catch (err) {
      const div = document.createElement('div');
      div.className = 'error-box';
      div.textContent = `Error loading ${sec.label}: ${err.message}`;
      frag.appendChild(div);
    }
  }

  if (token !== renderToken) return;

  const main = document.getElementById('content');
  if (!frag.childNodes.length) {
    main.innerHTML = '<p class="empty-msg">No sections enabled. Click <b>Configure</b> to choose what to display.</p>';
    return;
  }
  main.replaceChildren(frag);
}

async function renderOverview(container) {
  const res = await fetch('/api/overview');
  if (!res.ok) throw new Error('Failed to load overview');
  const d = await res.json();

  const section = document.createElement('section');
  section.className = 'data-section';
  section.innerHTML = `
    <div class="overview-grid">
      ${statCard('Users', d.total_users)}
      ${statCard('Projects', d.total_projects)}
      ${statCard('Tasks', d.total_tasks)}
      ${statCard('Clients', d.total_clients)}
      ${statCard('Total Hours', d.total_hours)}
      ${statCard('Total Earned', '$' + Number(d.total_earned).toLocaleString())}
    </div>`;
  container.appendChild(section);
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

async function renderSummary(container, sec) {
  const params = new URLSearchParams();
  if (sec.sortBy)    params.set('sortBy', sec.sortBy);
  if (sec.sortOrder) params.set('sortOrder', sec.sortOrder);

  const res = await fetch('/api/summary?' + params);
  if (!res.ok) throw new Error('Failed to load summary');
  const rows = await res.json();
  const cols = sec.columns.length ? sec.columns : SUMMARY_COLS;

  container.appendChild(buildTableSection('User Summary', cols, rows, col => {
    if (col === 'total_earned' || col === 'wage') return v => '$' + Number(v).toLocaleString();
    if (col === 'total_hours') return v => v + 'h';
    return null;
  }));
}

async function renderTable(container, sec) {
  if (sec.id === 'entries') return renderEntries(container, sec);

  const params = new URLSearchParams();
  if (sec.columns.length) params.set('columns', sec.columns.join(','));
  if (sec.sortBy)         params.set('sortBy', sec.sortBy);
  if (sec.sortOrder)      params.set('sortOrder', sec.sortOrder);

  const res = await fetch(`/api/data/${sec.id}?${params}`);
  if (!res.ok) throw new Error('Failed to load ' + sec.id);
  const rows = await res.json();

  if (!rows.length) {
    const div = document.createElement('section');
    div.className = 'data-section';
    div.innerHTML = `<h2>${sec.label}</h2><div class="table-wrap"><p class="empty-msg">No data</p></div>`;
    container.appendChild(div);
    return;
  }

  const cols = sec.columns.length ? sec.columns : Object.keys(rows[0]);
  container.appendChild(buildTableSection(sec.label, cols, rows));
}

/* ===== Time Entries: start / stop timer, add past entry, delete ===== */

let flash = null;            // message shown after the next render: { kind: 'ok' | 'error', text }
let selectedTaskId = '';     // remembers the task picked in the dropdowns

async function api(method, url, body) {
  const opts = { method, headers: {} };
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

function esc(val) {
  return String(val === null || val === undefined ? '' : val)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatElapsed(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Updates every running-timer clock once a second (no server calls)
function tickTimers() {
  document.querySelectorAll('.timer-clock').forEach(el => {
    const base = Number(el.dataset.elapsed);
    const fetchedAt = Number(el.dataset.fetched);
    el.textContent = formatElapsed(base + (Date.now() - fetchedAt) / 1000);
  });
}

function toLocalInputValue(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function taskOptionsHtml(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const g = t.project_name || 'No project';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  let html = '';
  for (const [project, list] of groups) {
    html += `<optgroup label="${esc(project)}">`;
    html += list.map(t => {
      const sel = String(t.task_id) === String(selectedTaskId) ? ' selected' : '';
      return `<option value="${t.task_id}"${sel}>${esc(t.task_name || 'Task ' + t.task_id)}</option>`;
    }).join('');
    html += '</optgroup>';
  }
  return html;
}

function showMessage(kind, text) {
  const box = document.getElementById('trackerMsg');
  if (!box) return;
  box.className = kind === 'error' ? 'error-box' : 'ok-box';
  box.textContent = text;
  box.hidden = false;
}

// Runs an action, then refreshes the dashboard. Buttons are locked meanwhile (no double clicks).
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
  const params = new URLSearchParams();
  if (sec.columns.length) params.set('columns', sec.columns.join(','));
  if (sec.sortBy)         params.set('sortBy', sec.sortBy);
  if (sec.sortOrder)      params.set('sortOrder', sec.sortOrder);

  const rows = await api('GET', `/api/data/entries?${params}`);

  // Timer controls are optional: if they fail, the entries table still shows.
  let timers = [], tasks = [], trackerError = null;
  try {
    [timers, tasks] = await Promise.all([api('GET', '/api/timers'), api('GET', '/api/tracker/tasks')]);
  } catch (err) {
    trackerError = err.message;
  }

  const section = document.createElement('section');
  section.className = 'data-section entries-section';
  section.innerHTML = `<h2>${esc(sec.label)}</h2>`;

  // Message area (errors/success from the last action)
  const msg = document.createElement('div');
  msg.id = 'trackerMsg';
  msg.hidden = true;
  section.appendChild(msg);
  if (flash) {
    msg.className = flash.kind === 'error' ? 'error-box' : 'ok-box';
    msg.textContent = flash.text;
    msg.hidden = false;
    flash = null;
  }

  if (trackerError) {
    const err = document.createElement('div');
    err.className = 'error-box';
    err.textContent = 'Timer and add-entry controls are unavailable: ' + trackerError;
    section.appendChild(err);
  } else {
    section.appendChild(buildTrackerControls(tasks));
    if (timers.length) section.appendChild(buildTimerList(timers));
  }

  // Entries table (+ Delete column)
  if (!rows.length) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.innerHTML = '<p class="empty-msg">No entries yet</p>';
    section.appendChild(wrap);
  } else {
    const cols = sec.columns.length ? sec.columns : schema.entries;
    const wrap = buildTableSection(sec.label, cols, rows).querySelector('.table-wrap');

    const headRow = wrap.querySelector('thead tr');
    headRow.appendChild(document.createElement('th'));

    wrap.querySelectorAll('tbody tr').forEach((tr, i) => {
      const row = rows[i];
      const td = document.createElement('td');
      td.className = 'row-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-delete';
      btn.textContent = 'Delete';
      btn.title = 'Delete this entry';
      btn.addEventListener('click', () => {
        const ok = confirm(`Delete the entry that started at ${row._ts} (duration ${row._td})?\n\nThis cannot be undone.`);
        if (!ok) return;
        runAction(async () => {
          const q = new URLSearchParams({ timer_start: row._ts, timer_duration: row._td });
          await api('DELETE', '/api/entries?' + q);
          flash = { kind: 'ok', text: 'Entry deleted.' };
        });
      });
      td.appendChild(btn);
      tr.appendChild(td);
    });
    section.appendChild(wrap);
  }

  container.appendChild(section);
}

function buildTrackerControls(tasks) {
  const box = document.createElement('div');
  box.className = 'tracker-controls';

  if (!tasks.length) {
    box.innerHTML = '<p class="empty-msg">There are no tasks yet. Add a task first, then you can track time on it.</p>';
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
        <select name="task" id="manualTask">${options}</select>
      </label>
      <label>Start
        <input type="datetime-local" name="start" id="manualStart" required>
      </label>
      <label>End
        <input type="datetime-local" name="end" id="manualEnd" required>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Add entry</button>
        <button type="button" class="btn" id="cancelManualBtn">Cancel</button>
      </div>
    </form>`;

  const timerTask  = box.querySelector('#timerTask');
  const manualTask = box.querySelector('#manualTask');
  const form       = box.querySelector('#manualForm');

  // Keep both dropdowns in sync and remember the choice across refreshes
  if (!selectedTaskId || !tasks.some(t => String(t.task_id) === String(selectedTaskId))) {
    selectedTaskId = String(tasks[0].task_id);
  }
  timerTask.value = manualTask.value = selectedTaskId;
  const onTaskChange = e => { selectedTaskId = e.target.value; timerTask.value = manualTask.value = selectedTaskId; };
  timerTask.addEventListener('change', onTaskChange);
  manualTask.addEventListener('change', onTaskChange);

  // Start a timer
  box.querySelector('#startTimerBtn').addEventListener('click', () => {
    runAction(async () => {
      await api('POST', '/api/timers', { task_id: Number(timerTask.value) });
      flash = { kind: 'ok', text: 'Timer started. Click Stop when you are done.' };
    });
  });

  // Add a past entry
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
    const end   = box.querySelector('#manualEnd').value;
    if (!start || !end) return showMessage('error', 'Please fill in both the start and end time.');
    if (end <= start)   return showMessage('error', 'End time must be after the start time.');
    runAction(async () => {
      const r = await api('POST', '/api/entries', { task_id: Number(manualTask.value), start, end });
      flash = { kind: 'ok', text: `Entry added (${r.timer_duration}).` };
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
        <div class="timer-meta">${esc(t.project_name || '')} &middot; started ${esc(t.started_at)}</div>
      </div>
      <div class="timer-clock" data-elapsed="${Number(t.elapsed_seconds) || 0}" data-fetched="${fetchedAt}">${formatElapsed(t.elapsed_seconds)}</div>
      <button type="button" class="btn btn-stop">&#9632; Stop</button>
      <button type="button" class="btn btn-quiet">Discard</button>`;

    row.querySelector('.btn-stop').addEventListener('click', () => {
      runAction(async () => {
        const r = await api('POST', `/api/timers/${t.timer_id}/stop`);
        flash = { kind: 'ok', text: `Timer stopped. Saved ${r.timer_duration} on “${t.task_name}”.` };
      });
    });

    row.querySelector('.btn-quiet').addEventListener('click', () => {
      if (!confirm('Discard this running timer without saving an entry?')) return;
      runAction(async () => {
        await api('DELETE', `/api/timers/${t.timer_id}`);
        flash = { kind: 'ok', text: 'Timer discarded.' };
      });
    });

    list.appendChild(row);
  });
  return list;
}

/* ===== Helpers ===== */

function buildTableSection(title, cols, rows, formatterFactory) {
  const section = document.createElement('section');
  section.className = 'data-section';

  const headHtml = cols.map(c => `<th>${formatHeader(c)}</th>`).join('');
  const bodyHtml = rows.map(row => {
    const cells = cols.map(c => {
      let v = row[c];
      // Apply custom formatter if provided
      if (formatterFactory) {
        const fn = formatterFactory(c);
        if (fn && v !== null && v !== undefined) v = fn(v);
      }
      return `<td>${esc(formatValue(v))}</td>`;   // escaped so names containing < > & display literally
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  section.innerHTML = `
    <h2>${title}</h2>
    <div class="table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`;
  return section;
}

function formatHeader(col) {
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? '✓' : '✗';
  if (typeof val === 'object') {
    // pg interval object
    const parts = [];
    if (val.years)   parts.push(val.years + 'y');
    if (val.months)  parts.push(val.months + 'mo');
    if (val.days)    parts.push(val.days + 'd');
    if (val.hours)   parts.push(val.hours + 'h');
    if (val.minutes) parts.push(val.minutes + 'm');
    if (val.seconds) parts.push(val.seconds + 's');
    return parts.length ? parts.join(' ') : JSON.stringify(val);
  }
  // ISO date string → nicer display
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return String(val);
}

/* ===== Start ===== */
init();
