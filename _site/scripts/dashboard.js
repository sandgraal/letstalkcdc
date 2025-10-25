const globalScope = typeof window !== 'undefined' ? window : globalThis;
const doc = globalScope.document ?? null;

const LOG_STORAGE_KEY = 'cdcAgentLogs';
const DOC_STORAGE_KEY = 'lastProgressDocs';
const MAX_LOG_ENTRIES = 200;

const FILTERS = [
  {
    id: 'all',
    label: 'all',
    predicate: () => true,
  },
  {
    id: 'errors',
    label: 'errors',
    predicate: (entry) => entry.type === 'error' || entry.type === 'warn',
  },
  {
    id: 'sync',
    label: 'sync',
    predicate: (entry) => entry.source === 'SYNC',
  },
  {
    id: 'agent',
    label: 'agent',
    predicate: (entry) => entry.source === 'CDC_AGENT',
  },
];

let currentFilterIndex = 0;
let chartModulePromise = null;
let chartInstances = [];

const hasLocalStorage = (() => {
  try {
    if (!globalScope.localStorage) return false;
    const key = '__cdc_dashboard__';
    globalScope.localStorage.setItem(key, '1');
    globalScope.localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
})();

const safeStorage = {
  get(key) {
    if (!hasLocalStorage) return null;
    try {
      return globalScope.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  },
  set(key, value) {
    if (!hasLocalStorage) return;
    try {
      globalScope.localStorage.setItem(key, value);
    } catch (_) {
      /* ignore */
    }
  },
  remove(key) {
    if (!hasLocalStorage) return;
    try {
      globalScope.localStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  },
};

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const readStoredDocs = () => {
  const docs = safeJsonParse(safeStorage.get(DOC_STORAGE_KEY), []);
  return Array.isArray(docs) ? docs : [];
};

const readLogs = () => {
  const logs = safeJsonParse(safeStorage.get(LOG_STORAGE_KEY), []);
  if (!Array.isArray(logs)) {
    return [];
  }
  return logs
    .map((entry) => ({
      message: String(entry?.message ?? ''),
      type: typeof entry?.type === 'string' ? entry.type.toLowerCase() : 'info',
      source: typeof entry?.source === 'string' ? entry.source.toUpperCase() : 'CDC_AGENT',
      timestamp: typeof entry?.timestamp === 'number' ? entry.timestamp : Date.now(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
};

const writeLogs = (logs) => {
  safeStorage.set(LOG_STORAGE_KEY, JSON.stringify(logs));
};

const getFilter = (id) => FILTERS.find((filter) => filter.id === id) ?? FILTERS[0];

const updateFilterTooltip = (filter) => {
  const tooltip = doc?.getElementById('filterTooltip');
  if (!tooltip) return;
  tooltip.textContent = `FILTER: ${filter.label}`;
  tooltip.classList.add('visible');
  globalScope.setTimeout(() => tooltip.classList.remove('visible'), 1200);
};

const updateStatsCounter = (logs = readLogs()) => {
  const counter = doc?.getElementById('statsCounter');
  if (!counter) return;
  const count = logs.length;
  counter.textContent = String(count);
  counter.classList.add('updated');
  globalScope.setTimeout(() => counter.classList.remove('updated'), 300);
};

const applyLogFilter = (filterId) => {
  const filter = getFilter(filterId);
  const lines = doc?.querySelectorAll('#agentConsole .agent-line');
  if (!lines) return;
  lines.forEach((line) => {
    const source = (line.dataset.source ?? '').toUpperCase();
    const type = (line.dataset.type ?? '').toLowerCase();
    const entry = { source, type };
    const visible = filter.predicate(entry);
    line.style.display = visible ? '' : 'none';
  });
};

const renderLogEntry = (entry) => {
  const container = doc?.querySelector('#agentConsole .agent-scroll');
  if (!container) return;
  const row = doc.createElement('div');
  row.className = `agent-line ${entry.type}`;
  row.dataset.source = entry.source;
  row.dataset.type = entry.type;
  row.dataset.timestamp = String(entry.timestamp);
  row.innerHTML = `
    <span class="tag" aria-hidden="true">[${escapeHtml(entry.source)}]</span>
    <span class="sr-only">${escapeHtml(entry.source)}: </span>
    ${escapeHtml(entry.message)}
  `;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
};

const restoreLogConsole = () => {
  const container = doc?.querySelector('#agentConsole .agent-scroll');
  if (!container) return;
  container.innerHTML = '';
  const logs = readLogs();
  logs.forEach((entry) => renderLogEntry(entry));
  applyLogFilter(FILTERS[currentFilterIndex].id);
  updateStatsCounter(logs);
};

const appendAgentLog = (message, type = 'info', source = 'CDC_AGENT') => {
  const normalized = {
    message: String(message ?? ''),
    type: typeof type === 'string' ? type.toLowerCase() : 'info',
    source: typeof source === 'string' ? source.toUpperCase() : 'CDC_AGENT',
    timestamp: Date.now(),
  };

  const logs = readLogs();
  logs.push(normalized);
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
  }
  writeLogs(logs);

  renderLogEntry(normalized);
  applyLogFilter(FILTERS[currentFilterIndex].id);
  updateStatsCounter(logs);

  const modal = doc?.getElementById('sessionModal');
  if (modal && !modal.classList.contains('hidden')) {
    renderSessionDetails();
  }
};

const loadChartModule = async () => {
  if (chartModulePromise) return chartModulePromise;
  chartModulePromise = import(
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.esm.js'
  )
    .then((mod) => {
      const { Chart, registerables } = mod;
      Chart.register(...registerables);
      return mod;
    })
    .catch((error) => {
      console.warn('CDC Dashboard: Failed to load Chart.js', error);
      return null;
    });
  return chartModulePromise;
};

const destroyCharts = () => {
  chartInstances.forEach((chart) => {
    try {
      chart.destroy();
    } catch (_) {
      /* ignore */
    }
  });
  chartInstances = [];
};

const getThemeColors = () => {
  if (!doc?.body) {
    return { accent: '#00ff88', text: '#ffffff', grid: '#0a2a2a' };
  }
  const styles = globalScope.getComputedStyle(doc.body);
  return {
    accent: styles.getPropertyValue('--accent').trim() || '#00ff88',
    text: styles.getPropertyValue('--text').trim() || '#ffffff',
    grid: styles.getPropertyValue('--grid').trim() || '#0a2a2a',
  };
};

const computeModuleSummaries = (modules, docs) => {
  const docsById = new Map(docs.map((doc) => [doc.moduleId, doc]));
  return modules.map((module) => {
    const record = docsById.get(module.id) ?? null;
    const percent = Math.min(
      100,
      Math.max(
        0,
        typeof record?.percent === 'number'
          ? record.percent
          : record?.status === 'completed'
          ? 100
          : record?.status === 'in-progress'
          ? 50
          : 0,
      ),
    );
    return {
      module,
      percent,
      status:
        record?.status ?? (percent >= 99 ? 'completed' : percent > 0 ? 'in-progress' : 'not-started'),
      updatedAt: record?.updatedAt ?? null,
    };
  });
};

const renderLegend = (summary, colors) => {
  const legend = doc?.getElementById('progressLegend');
  if (!legend) return;
  const completed = summary.filter((entry) => entry.status === 'completed').length;
  const inProgress = summary.filter((entry) => entry.status === 'in-progress').length;
  const notStarted = summary.length - completed - inProgress;
  legend.innerHTML = `
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors.accent}"></span>
      <span>Completed (${completed})</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors.grid}"></span>
      <span>In progress (${inProgress})</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background:${colors.text};opacity:0.2"></span>
      <span>Not started (${notStarted})</span>
    </div>
  `;
};

const renderFooter = (summary) => {
  const footer = doc?.getElementById('progressFooter');
  if (!footer) return;

  const completed = summary.filter((entry) => entry.status === 'completed').length;
  const total = summary.length;
  const lastUpdated = summary
    .map((entry) => (entry.updatedAt ? new Date(entry.updatedAt) : null))
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const previousCompleted = footer.dataset.lastCompleted;
  footer.dataset.lastCompleted = String(completed);
  const shouldPulse =
    typeof previousCompleted !== 'undefined' && previousCompleted !== String(completed);

  footer.innerHTML = `
    <div class="footer-pill ${shouldPulse ? 'updated' : ''}">
      Modules completed: ${completed}/${total}
    </div>
    <div class="footer-pill ${shouldPulse ? 'updated' : ''}">
      Last update: ${
        lastUpdated ? lastUpdated.toLocaleString() : 'No synced progress yet'
      }
    </div>
  `;
};

const renderCharts = (canvasPrefix, summary, colors, Chart) => {
  const overallCanvas = doc?.getElementById(`${canvasPrefix}-overall`);
  const modulesCanvas = doc?.getElementById(`${canvasPrefix}-modules`);
  if (!overallCanvas || !modulesCanvas) return;

  destroyCharts();

  const percents = summary.map((entry) => entry.percent);
  const overallPercent =
    percents.length === 0
      ? 0
      : Math.round(percents.reduce((total, value) => total + value, 0) / percents.length);

  chartInstances.push(
    new Chart(overallCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [
          {
            data: [overallPercent, Math.max(0, 100 - overallPercent)],
            backgroundColor: [colors.accent, colors.grid],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Overall ${overallPercent}%`,
            color: colors.text,
            font: { size: 18 },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.label ?? '';
                const value = context.parsed;
                return `${label}: ${value}%`;
              },
            },
          },
        },
      },
    }),
  );

  chartInstances.push(
    new Chart(modulesCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: summary.map((entry) => entry.module.title ?? entry.module.id),
        datasets: [
          {
            data: summary.map((entry) => Math.round(entry.percent)),
            backgroundColor: colors.accent,
            borderWidth: 0,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Module progress',
            color: colors.text,
            font: { size: 16 },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed.x ?? context.parsed;
                return `${value}% complete`;
              },
            },
          },
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            ticks: { color: colors.text },
            grid: { color: colors.grid },
          },
          y: {
            ticks: { color: colors.text },
            grid: { display: false },
          },
        },
      },
    }),
  );
};

const renderProgressDashboard = async (canvasPrefix, modules = [], docsOverride) => {
  if (!doc) return;
  const moduleList = Array.isArray(modules) ? modules : [];
  const docs = Array.isArray(docsOverride) ? docsOverride : readStoredDocs();
  const colors = getThemeColors();
  const summary = computeModuleSummaries(moduleList, docs);

  renderLegend(summary, colors);
  renderFooter(summary);

  const chartModule = await loadChartModule();
  if (!chartModule) {
    return;
  }

  renderCharts(canvasPrefix, summary, colors, chartModule.Chart);
};

const renderSessionDetails = () => {
  const container = doc?.getElementById('sessionDetails');
  if (!container) return;

  const logs = readLogs();
  if (!logs.length) {
    container.innerHTML = '<p>No activity yet.</p>';
    return;
  }

  const countsBySource = new Map();
  logs.forEach((log) => {
    countsBySource.set(log.source, (countsBySource.get(log.source) ?? 0) + 1);
  });

  const summaryList = Array.from(countsBySource.entries())
    .map(
      ([source, count]) =>
        `<li><strong>${escapeHtml(source)}</strong>: ${count} event${count === 1 ? '' : 's'}</li>`,
    )
    .join('');

  const recent = logs
    .slice(-5)
    .reverse()
    .map(
      (log) => `
        <div class="agent-line ${escapeHtml(log.type)}">
          <span class="tag" aria-hidden="true">[${escapeHtml(log.source)}]</span>
          ${escapeHtml(log.message)}
        </div>
      `,
    )
    .join('');

  container.innerHTML = `
    <p><strong>Total events:</strong> ${logs.length}</p>
    <ul>${summaryList}</ul>
    <hr />
    <h3>Recent activity</h3>
    ${recent || '<p>No recent events</p>'}
  `;
};

const showSessionModal = () => {
  const modal = doc?.getElementById('sessionModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  renderSessionDetails();
  const trigger = doc?.getElementById('statsButton');
  trigger?.setAttribute('aria-expanded', 'true');
};

const hideSessionModal = () => {
  const modal = doc?.getElementById('sessionModal');
  if (!modal) return;
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const trigger = doc?.getElementById('statsButton');
  trigger?.setAttribute('aria-expanded', 'false');
};

const exportLogs = (format) => {
  const logs = readLogs();
  if (!logs.length) {
    globalScope.alert?.('No logs to export yet.');
    return;
  }

  let content = '';
  let mime = 'text/plain';

  if (format === 'json') {
    content = JSON.stringify(logs, null, 2);
    mime = 'application/json';
  } else {
    content = logs
      .map(
        (log) =>
          `[${new Date(log.timestamp).toLocaleString()}] [${log.source}] (${log.type}) ${log.message}`,
      )
      .join('\n');
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc?.createElement('a');
  if (!anchor) {
    URL.revokeObjectURL(url);
    return;
  }
  anchor.href = url;
  const extension = format === 'json' ? 'json' : 'txt';
  anchor.download = `cdc-session-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const cycleFilter = () => {
  currentFilterIndex = (currentFilterIndex + 1) % FILTERS.length;
  const filter = FILTERS[currentFilterIndex];
  updateFilterTooltip(filter);
  applyLogFilter(filter.id);
};

const initialize = () => {
  if (!doc) return;

  try {
    if (hasLocalStorage && globalScope.localStorage.getItem('theme') === 'modern') {
      doc.body?.classList.add('modern');
    }
  } catch (_) {
    /* ignore */
  }

  restoreLogConsole();
  applyLogFilter(FILTERS[currentFilterIndex].id);

  const counter = doc.getElementById('statsCounter');
  counter?.addEventListener('click', cycleFilter);

  const statsButton = doc.getElementById('statsButton');
  statsButton?.addEventListener('click', showSessionModal);

  const closeButton = doc.getElementById('closeModal');
  closeButton?.addEventListener('click', hideSessionModal);

  doc.getElementById('exportTxt')?.addEventListener('click', () => exportLogs('txt'));
  doc.getElementById('exportJson')?.addEventListener('click', () => exportLogs('json'));

  const modal = doc.getElementById('sessionModal');
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      hideSessionModal();
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSessionModal();
    }
  });
};

if (doc) {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}

export { appendAgentLog, applyLogFilter, renderProgressDashboard, updateStatsCounter };
