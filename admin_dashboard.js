const dashboardStatus = document.getElementById('dashboardStatus');

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the server. Check the network connection and try again.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function todayInMalaysia() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateValue, days) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function setCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function renderRows(body, rows, columns, emptyText) {
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = setCell(row, emptyText, 'empty');
    cell.colSpan = columns.length;
    body.appendChild(row);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('tr');
    for (const column of columns) {
      const value = column.value(item);
      const cell = setCell(row, value, column.className ? column.className(item) : '');
      if (column.title) cell.title = column.title(item) || '';
    }
    body.appendChild(row);
  }
}

function number(value) {
  return Number(value || 0).toLocaleString('en-MY');
}

function formatMalaysiaTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'medium'
  });
}

function runIdShort(value) {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function renderDaily(rows) {
  const container = document.getElementById('dailyChart');
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No inspection records in this date range.';
    container.appendChild(empty);
    return;
  }
  const max = Math.max(1, ...rows.map(row => Number(row.totalCount || 0)));
  for (const item of rows) {
    const total = Number(item.totalCount || 0);
    const ok = Number(item.okCount || 0);
    const ng = Number(item.ngCount || 0);
    const tooltip = `${item.productionDate}: ${number(ok)} OK, ${number(ng)} NG, ${number(total)} total`;
    const line = document.createElement('div');
    line.className = 'trend-row';
    line.title = tooltip;
    const day = document.createElement('span');
    day.textContent = item.productionDate;
    const track = document.createElement('div');
    track.className = 'bar-track';
    track.title = tooltip;
    track.setAttribute('aria-label', tooltip);
    const okBar = document.createElement('span');
    okBar.className = 'bar-ok';
    okBar.title = tooltip;
    okBar.style.width = `${Math.min(100, (ok / max) * 100)}%`;
    const ngBar = document.createElement('span');
    ngBar.className = 'bar-ng';
    ngBar.title = tooltip;
    ngBar.style.width = `${Math.min(100, (ng / max) * 100)}%`;
    track.append(okBar, ngBar);
    const count = document.createElement('span');
    count.className = 'trend-total';
    count.textContent = number(total);
    line.append(day, track, count);
    container.appendChild(line);
  }
}

function renderDashboard(data) {
  const { summary } = data;
  document.getElementById('totalCount').textContent = number(summary.totalCount);
  document.getElementById('okCount').textContent = number(summary.okCount);
  document.getElementById('ngCount').textContent = number(summary.ngCount);
  document.getElementById('yieldPercent').textContent = `${Number(summary.yieldPercent || 0).toFixed(1)}%`;
  document.getElementById('runCount').textContent = `${number(summary.runCount)} production runs`;
  renderDaily(data.daily);

  renderRows(document.getElementById('machineRows'), data.byMachine, [
    { value: row => row.machineId },
    { value: row => number(row.runCount) },
    { value: row => number(row.okCount) },
    { value: row => number(row.ngCount) },
    { value: row => number(row.totalCount) }
  ], 'No machine results in this range.');

  renderRows(document.getElementById('partRows'), data.byPart, [
    { value: row => row.partNumber },
    { value: row => number(row.runCount) },
    { value: row => number(row.okCount) },
    { value: row => number(row.ngCount) },
    { value: row => number(row.totalCount) }
  ], 'No part results in this range.');

  renderRows(document.getElementById('runRows'), data.runs, [
    { value: row => formatMalaysiaTime(row.startedAtUtc) },
    { value: row => row.partNumber },
    { value: row => row.machineId },
    { value: row => row.operatorName },
    { value: row => number(row.okCount) },
    { value: row => number(row.ngCount) }
  ], 'No production runs in this range.');

  renderRows(document.getElementById('resultRows'), data.recentResults, [
    { value: row => formatMalaysiaTime(row.occurredAtUtc) },
    { value: row => row.status, className: row => `badge ${row.status.toLowerCase()}` },
    { value: row => row.partNumber },
    { value: row => row.machineId },
    { value: row => row.operatorName },
    { value: row => runIdShort(row.runId), title: row => row.runId }
  ], 'No inspection results in this range.');

  const partFilter = document.getElementById('partFilter');
  const selectedPart = partFilter.value;
  partFilter.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All part numbers';
  partFilter.appendChild(all);
  for (const part of data.parts) {
    const option = document.createElement('option');
    option.value = part.partNumber;
    option.textContent = part.partNumber;
    partFilter.appendChild(option);
  }
  if ([...partFilter.options].some(option => option.value === selectedPart)) partFilter.value = selectedPart;

  document.getElementById('lastUpdated').textContent = `Last updated ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}. Refresh manually to query the server again.`;
}

async function loadDashboard() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;
  if (!from || !to) {
    setStatus(dashboardStatus, 'Choose both a start and end date.', true);
    return;
  }

  const params = new URLSearchParams({ from, to });
  const partNumber = document.getElementById('partFilter').value;
  if (partNumber) params.set('partNumber', partNumber);
  const buttons = [document.getElementById('applyButton'), document.getElementById('refreshButton')];
  buttons.forEach(button => { button.disabled = true; });
  setStatus(dashboardStatus, 'Loading tray inspection data…');
  try {
    const data = await requestJson(`/admin/api/dashboard?${params.toString()}`);
    renderDashboard(data);
    setStatus(dashboardStatus, `Showing ${from} to ${to}${partNumber ? ` · part ${partNumber}` : ' · all part numbers'}.`);
  } catch (error) {
    setStatus(dashboardStatus, error.message, true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.getElementById('filterForm').addEventListener('submit', event => {
  event.preventDefault();
  loadDashboard();
});
document.getElementById('refreshButton').addEventListener('click', loadDashboard);

const today = todayInMalaysia();
document.getElementById('toDate').value = today;
document.getElementById('fromDate').value = shiftDate(today, -29);
loadDashboard();
