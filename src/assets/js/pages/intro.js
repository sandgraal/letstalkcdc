const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

const loadScript = (src) => (
  new Promise((resolve, reject) => {
    const existing = [...doc.scripts].find((s) => s.src === src);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      }
      return;
    }
    const script = doc.createElement('script');
    script.src = src;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    doc.head.appendChild(script);
  })
);

const ensureChart = async () => {
  if (window.Chart) return window.Chart;
  const cdn = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.js';
  try {
    await loadScript(cdn);
    if (window.Chart) return window.Chart;
  } catch (_) {
    /* ignore */
  }
  await loadScript('/assets/js/vendor/chart.umd.js');
  return window.Chart;
};

onReady(() => {
  const grid = doc.getElementById('cdc-grid');
  const chipsRow = doc.getElementById('cdc-chips');
  const searchInput = doc.getElementById('cdc-search');
  const resetBtn = doc.getElementById('cdc-reset');
  const countEl = doc.getElementById('cdc-count');

  if (!grid || !chipsRow || !searchInput || !resetBtn || !countEl) return;

  const cards = Array.from(grid.querySelectorAll('.cdc-card'));
  const tagSet = new Set();
  cards.forEach((card) => {
    const tags = (card.getAttribute('data-tags') || '')
      .split(',')
      .map((text) => text.trim().toLowerCase())
      .filter(Boolean);
    card.dataset.tags = tags.join(',');
    tags.forEach((tag) => tagSet.add(tag));
  });

  const state = { tags: new Set(), q: '' };

  const syncHash = () => {
    const params = new URLSearchParams();
    if (state.tags.size) params.set('cdc', [...state.tags].join(','));
    if (state.q) params.set('q', state.q);
    const next = `#${params.toString()}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  };

  const render = () => {
    const query = state.q.toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const name = card.querySelector('h3')?.textContent.toLowerCase() || '';
      const body = card.querySelector('p')?.textContent.toLowerCase() || '';
      const tags = (card.dataset.tags || '').split(',').filter(Boolean);
      const hasAll = [...state.tags].every((tag) => tags.includes(tag));
      const matches = !query || name.includes(query) || body.includes(query);
      const show = hasAll && matches;
      card.classList.toggle('cdc-hide', !show);
      if (show) visible += 1;
    });
    countEl.textContent = `${visible} shown / ${cards.length} total`;
  };

  const makeChip = (tag) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cdc-chip';
    button.textContent = tag;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const isActive = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', isActive ? 'false' : 'true');
      if (isActive) {
        state.tags.delete(tag);
      } else {
        state.tags.add(tag);
      }
      syncHash();
      render();
    });
    return button;
  };

  [...tagSet].sort().forEach((tag) => chipsRow.appendChild(makeChip(tag)));

  searchInput.addEventListener('input', (event) => {
    state.q = event.target.value.trim();
    syncHash();
    render();
  });

  resetBtn.addEventListener('click', () => {
    state.q = '';
    searchInput.value = '';
    state.tags.clear();
    chipsRow.querySelectorAll('.cdc-chip').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    syncHash();
    render();
  });

  const parseHash = () => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const tags = (params.get('cdc') || '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const q = (params.get('q') || '').trim();
    state.tags = new Set(tags);
    state.q = q;
    chipsRow.querySelectorAll('.cdc-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', state.tags.has(chip.textContent.toLowerCase()) ? 'true' : 'false');
    });
    searchInput.value = state.q;
  };

  window.addEventListener('hashchange', () => {
    parseHash();
    render();
  });

  parseHash();
  render();
});

onReady(async () => {
  const canvas = doc.getElementById('methodsChart');
  if (!canvas) return;
  const ChartModule = await ensureChart();
  if (!ChartModule) return;

  const css = getComputedStyle(doc.documentElement);
  const getToken = (token, fallback) => css.getPropertyValue(token).trim() || fallback;
  const cBorder = getToken('--border-color', '#2a3341');
  const cText = getToken('--text-primary', '#e5e7eb');
  const cText2 = getToken('--text-secondary', '#94a3b8');
  const cBack = getToken('--bg-secondary', 'rgba(15,23,42,.6)');
  const teal = '#14b8a6';
  const blue = '#3b82f6';
  const red = '#ef4444';

  const hex = (hexValue, alpha) => {
    const h = hexValue.replace('#', '');
    const to = (value) => parseInt(value, 16);
    if (h.length === 3) {
      return `rgba(${to(h[0] + h[0])},${to(h[1] + h[1])},${to(h[2] + h[2])},${alpha})`;
    }
    return `rgba(${to(h.slice(0, 2))},${to(h.slice(2, 4))},${to(h.slice(4, 6))},${alpha})`;
  };

  new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Completeness', 'Low Impact', 'Low Latency', 'Low Maintenance', 'Ease of Implementation'],
      datasets: [
        {
          label: 'Log-Based',
          data: [5, 5, 5, 4, 2],
          borderColor: teal,
          backgroundColor: hex(teal, 0.15),
          pointBackgroundColor: teal,
          pointBorderColor: teal,
          pointRadius: 3
        },
        {
          label: 'Trigger-Based',
          data: [4, 3, 4, 2, 3],
          borderColor: blue,
          backgroundColor: hex(blue, 0.12),
          pointBackgroundColor: blue,
          pointBorderColor: blue,
          pointRadius: 3
        },
        {
          label: 'Query-Based',
          data: [1, 2, 1, 2, 5],
          borderColor: red,
          backgroundColor: hex(red, 0.1),
          pointBackgroundColor: red,
          pointBorderColor: red,
          pointRadius: 3
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      elements: { line: { borderWidth: 2.25 } },
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1, backdropColor: cBack, color: cText2 },
          grid: { color: cBorder },
          angleLines: { color: cBorder },
          pointLabels: { color: cText2, font: { size: 12 } }
        }
      },
      plugins: {
        legend: { position: 'top', labels: { color: cText } },
        title: {
          display: true,
          text: 'Comparing CDC Approaches',
          color: cText,
          font: { size: 18, weight: '700' }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}/5`
          }
        }
      }
    }
  });
});
