/* ===== State ===== */

const SUMMARY_COLS = ['name','email','wage','total_projects','total_tasks','total_hours','total_earned'];

const DEFAULT_SETTINGS = {
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
    { id: 'entries',   label: 'Entries',   visible: false, type: 'table', columns: [], sortBy: '', sortOrder: 'asc' },
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
  saveSettings();

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

async function renderContent() {
  const main = document.getElementById('content');
  main.innerHTML = '';

  for (const sec of settings.sections) {
    if (!sec.visible) continue;
    try {
      if (sec.type === 'overview') await renderOverview(main);
      else if (sec.type === 'summary') await renderSummary(main, sec);
      else if (sec.type === 'table')   await renderTable(main, sec);
    } catch (err) {
      const div = document.createElement('div');
      div.className = 'error-box';
      div.textContent = `Error loading ${sec.label}: ${err.message}`;
      main.appendChild(div);
    }
  }

  if (main.innerHTML === '') {
    main.innerHTML = '<p class="empty-msg">No sections enabled. Click <b>Configure</b> to choose what to display.</p>';
  }
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
      return `<td>${formatValue(v)}</td>`;
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
