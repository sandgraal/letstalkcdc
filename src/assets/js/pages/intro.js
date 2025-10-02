import { drawRadarChart } from '../lib/charts.js';

const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
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
      if (isActive) state.tags.delete(tag);
      else state.tags.add(tag);
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

onReady(() => {
  const canvas = doc.getElementById('methodsChart');
  if (!canvas) return;

  const css = getComputedStyle(doc.documentElement);
  const palette = {
    axis: css.getPropertyValue('--border-color').trim() || 'rgba(51, 65, 85, 0.7)',
    grid: 'rgba(148, 163, 184, 0.25)',
    text: css.getPropertyValue('--text-secondary').trim() || '#94a3b8',
    background: css.getPropertyValue('--bg-primary').trim() || '#ffffff'
  };

  const datasets = [
    { label: 'Log-Based', data: [5, 5, 5, 4, 2], color: '#14b8a6', fillAlpha: 0.18 },
    { label: 'Trigger-Based', data: [4, 3, 4, 2, 3], color: '#3b82f6', fillAlpha: 0.14 },
    { label: 'Query-Based', data: [1, 2, 1, 2, 5], color: '#ef4444', fillAlpha: 0.12 }
  ];

  const labels = [
    'Completeness',
    'Low Impact',
    'Low Latency',
    'Low Maintenance',
    'Ease of Implementation'
  ];

  const render = () => drawRadarChart(canvas, { labels, datasets, palette });

  render();
  window.addEventListener('resize', render);
});
