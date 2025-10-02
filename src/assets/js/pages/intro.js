const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

const prepareCanvas = (canvas, height = 420) => {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
};

const toRgba = (hex, alpha) => {
  const value = hex.replace('#', '').trim();
  const expand = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const paddingLeft = (width) => Math.max(32, width * 0.1);

const drawRadarChart = (canvas, { labels, datasets, palette }) => {
  const { ctx, width, height } = prepareCanvas(canvas, 420);
  const centerX = width / 2;
  const topPadding = 36;
  const radius = Math.min(width, height - 90) / 2 - topPadding;
  const axes = labels.length;
  const steps = 5;

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.font = '500 13px var(--font-sans, system-ui)';
  ctx.fillStyle = palette.text;

  for (let step = 1; step <= steps; step += 1) {
    const stepRadius = (radius * step) / steps;
    ctx.beginPath();
    for (let i = 0; i < axes; i += 1) {
      const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
      const x = centerX + Math.cos(angle) * stepRadius;
      const y = topPadding + radius + Math.sin(angle) * stepRadius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < axes; i += 1) {
    const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = topPadding + radius + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(centerX, topPadding + radius);
    ctx.lineTo(x, y);
    ctx.strokeStyle = palette.axis;
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = angle > Math.PI / 2 || angle < -Math.PI / 2 ? 'bottom' : 'top';
    ctx.fillStyle = palette.text;
    ctx.font = '600 13px var(--font-sans, system-ui)';
    ctx.fillText(labels[i], 0, angle > Math.PI / 2 || angle < -Math.PI / 2 ? -12 : 12);
    ctx.restore();
  }

  datasets.forEach((dataset) => {
    ctx.beginPath();
    dataset.data.forEach((value, index) => {
      const angle = (Math.PI * 2 * index) / axes - Math.PI / 2;
      const distance = (Math.max(0, Math.min(5, value)) / 5) * radius;
      const x = centerX + Math.cos(angle) * distance;
      const y = topPadding + radius + Math.sin(angle) * distance;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = toRgba(dataset.color, dataset.fillAlpha);
    ctx.strokeStyle = dataset.color;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    dataset.data.forEach((value, index) => {
      const angle = (Math.PI * 2 * index) / axes - Math.PI / 2;
      const distance = (Math.max(0, Math.min(5, value)) / 5) * radius;
      const x = centerX + Math.cos(angle) * distance;
      const y = topPadding + radius + Math.sin(angle) * distance;
      ctx.beginPath();
      ctx.fillStyle = palette.background;
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dataset.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '500 13px var(--font-sans, system-ui)';
  ctx.fillStyle = palette.text;

  const legendX = paddingLeft(width);
  const legendYStart = height - 60;
  const legendGap = 20;

  datasets.forEach((dataset, index) => {
    const y = legendYStart + index * legendGap;
    ctx.fillStyle = toRgba(dataset.color, dataset.fillAlpha);
    ctx.fillRect(legendX, y - 6, 18, 18);
    ctx.strokeStyle = dataset.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(legendX, y - 6, 18, 18);
    ctx.fillStyle = palette.text;
    ctx.fillText(dataset.label, legendX + 28, y + 3);
  });
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
