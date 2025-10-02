const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

const prepareCanvas = (canvas, height = 280) => {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
};

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawBarChart = (canvas, values, labels, palette) => {
  const { ctx, width, height } = prepareCanvas(canvas);
  const padding = 32;
  const barGap = 24;
  const axisY = height - padding;
  const chartHeight = axisY - padding;

  const maxValue = Math.max(...values, 1);
  const count = values.length;
  const totalGap = barGap * (count - 1);
  const barWidth = Math.max(24, (width - padding * 2 - totalGap) / count);

  // Axes
  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, axisY + 0.5);
  ctx.lineTo(width - padding + 0.5, axisY + 0.5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = palette.text;
  ctx.font = '600 13px var(--font-sans, system-ui)';

  values.forEach((value, index) => {
    const x = padding + index * (barWidth + barGap);
    const barHeight = (value / maxValue) * chartHeight;
    const y = axisY - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, axisY);
    gradient.addColorStop(0, palette.bars[index].strong);
    gradient.addColorStop(1, palette.bars[index].soft);

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, 8);
    ctx.fill();

    ctx.fillStyle = palette.textStrong;
    ctx.font = '600 14px var(--font-sans, system-ui)';
    ctx.fillText(Math.round(value), x + barWidth / 2, y - 22);

    ctx.fillStyle = palette.text;
    ctx.font = '500 13px var(--font-sans, system-ui)';
    ctx.fillText(labels[index], x + barWidth / 2, axisY + 8);
  });

  // Tick marks
  ctx.fillStyle = palette.textMuted;
  ctx.font = '500 12px var(--font-sans, system-ui)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const value = (maxValue / steps) * i;
    const y = axisY - (value / maxValue) * chartHeight;
    ctx.beginPath();
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(padding, y + 0.5);
    ctx.lineTo(width - padding, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(Math.round(value), padding - 10, y);
  }
};

onReady(() => {
  const $ = (sel) => doc.querySelector(sel);
  const I = {
    tenants: $('#tenants'),
    chgRate: $('#chgRate'),
    payload: $('#payload'),
    envelope: $('#envelope'),
    topicsPerTenant: $('#topicsPerTenant'),
    sharedTopics: $('#sharedTopics'),
    isolation: $('#isolation'),
    rf: $('#rf'),
    parts: $('#parts'),
    retention: $('#retention'),
    compression: $('#compression')
  };
  if (!I.tenants) return;
  const O = {
    tenants: $('#tenants-val'),
    chgRate: $('#chgRate-val'),
    payload: $('#payload-val'),
    envelope: $('#envelope-val'),
    topicsPerTenant: $('#topicsPerTenant-val'),
    sharedTopics: $('#sharedTopics-val'),
    rf: $('#rf-val'),
    parts: $('#parts-val'),
    retention: $('#retention-val'),
    compression: $('#compression-val'),
    kTopics: $('#kTopics'),
    kGroups: $('#kGroups'),
    kEgress: $('#kEgress'),
    kBrokerEgress: $('#kBrokerEgress'),
    kEgressMonth: $('#kEgressMonth'),
    kConnect: $('#kConnect'),
    kParts: $('#kParts'),
    kStorageTB: $('#kStorageTB')
  };

  const GROUPS_PER_TENANT = 2;
  const CONNECTOR_PER_TENANT = 0.2;
  const OVERHEAD_PER_MESSAGE = 120;
  const SEC_PER_MONTH = 60 * 60 * 24 * 30;
  const SEC_PER_DAY = 86400;

  const palette = {
    axis: '#334155',
    grid: 'rgba(148, 163, 184, 0.35)',
    text: 'var(--text-secondary, #64748b)',
    textMuted: 'var(--text-muted, #94a3b8)',
    textStrong: 'var(--text-primary, #0f172a)',
    bars: [
      { soft: 'rgba(14, 165, 233, 0.35)', strong: 'rgba(14, 165, 233, 0.95)' },
      { soft: 'rgba(250, 204, 21, 0.35)', strong: 'rgba(250, 204, 21, 0.95)' },
      { soft: 'rgba(248, 113, 113, 0.35)', strong: 'rgba(248, 113, 113, 0.95)' }
    ]
  };

  const reflect = () => {
    O.tenants.textContent = I.tenants.value;
    O.chgRate.textContent = I.chgRate.value;
    O.payload.textContent = I.payload.value;
    O.envelope.textContent = I.envelope.value;
    O.topicsPerTenant.textContent = I.topicsPerTenant.value;
    O.sharedTopics.textContent = I.sharedTopics.value;
    O.rf.textContent = I.rf.value;
    O.parts.textContent = I.parts.value;
    O.retention.textContent = I.retention.value;
    O.compression.textContent = I.compression.value;
  };

  const chartCanvas = $('#costChart');
  let chartValues = [0, 0, 0];

  const updateChart = () => {
    if (!chartCanvas) return;
    drawBarChart(
      chartCanvas,
      chartValues,
      ['Shared Topics', 'Per-Tenant Topics', 'Per-Tenant Clusters'],
      palette
    );
  };

  const calc = () => {
    const t = +I.tenants.value;
    const r = +I.chgRate.value;
    const s = +I.payload.value;
    const env = +I.envelope.value;
    const tpt = +I.topicsPerTenant.value;
    const shared = +I.sharedTopics.value;
    const iso = I.isolation.value;
    const rf = Math.max(1, +I.rf.value || 1);
    const partsPerTopic = Math.max(1, +I.parts.value);
    const retentionDays = Math.max(1, +I.retention.value);
    const compression = Math.max(0.5, +I.compression.value);

    const topics = iso === 'shared' ? shared : t * tpt;
    const totalPartitions = topics * partsPerTopic;

    const groups = Math.max(1, Math.round(t * GROUPS_PER_TENANT));
    const footprint = iso === 'perTenantClusters'
      ? t
      : Math.max(1, Math.round(t * CONNECTOR_PER_TENANT));

    const egressBytes = t * r * (s + env + OVERHEAD_PER_MESSAGE);
    const brokerBytes = egressBytes * Math.max(0, rf - 1);
    const egressMBps = egressBytes / 1e6;
    const brokerMBps = brokerBytes / 1e6;
    const egressGBpm = (egressBytes * SEC_PER_MONTH) / 1e9;
    const storageBytes = (egressBytes * rf * (SEC_PER_DAY * retentionDays)) / Math.max(0.5, compression);
    const storageTB = storageBytes / 1e12;

    O.kTopics.textContent = topics.toLocaleString();
    O.kGroups.textContent = groups.toLocaleString();
    O.kEgress.textContent = egressMBps.toFixed(2);
    O.kBrokerEgress.textContent = brokerMBps.toFixed(2);
    O.kEgressMonth.textContent = egressGBpm.toFixed(1);
    O.kConnect.textContent = footprint.toLocaleString();
    O.kParts.textContent = totalPartitions.toLocaleString();
    O.kStorageTB.textContent = storageTB.toFixed(2);

    const e0 = egressMBps;
    const f0 = footprint;
    const c0 = e0 + f0;
    const c1 = e0 + f0 + t * 0.5;
    const c2 = e0 + t;
    chartValues = [c0, c1, c2];
    updateChart();
  };

  const PARAMS = [
    'tenants',
    'chgRate',
    'payload',
    'envelope',
    'topicsPerTenant',
    'sharedTopics',
    'isolation',
    'rf',
    'parts',
    'retention',
    'compression'
  ];

  const clamp = (el, value) => {
    if (!el) return value;
    if (el.type === 'range' || el.type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        const min = el.min !== '' ? Number(el.min) : -Infinity;
        const max = el.max !== '' ? Number(el.max) : Infinity;
        return String(Math.min(Math.max(n, min), max));
      }
      return el.value;
    }
    if (el.tagName === 'SELECT') {
      return [...el.options].some((option) => option.value === value) ? value : el.value;
    }
    return value;
  };

  const readParams = () => {
    const url = new URL(location.href);
    for (const key of PARAMS) {
      const el = I[key];
      if (!el) continue;
      const raw = url.searchParams.get(key) ?? (() => {
        try {
          return localStorage.getItem(key);
        } catch (_) {
          return null;
        }
      })();
      if (raw != null) {
        el.value = clamp(el, raw);
      }
    }
  };

  const writeParams = (push = false) => {
    const url = new URL(location.href);
    for (const key of PARAMS) {
      const el = I[key];
      if (!el) continue;
      url.searchParams.set(key, el.value);
      try {
        localStorage.setItem(key, el.value);
      } catch (_) {
        /* ignore */
      }
    }
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  };

  $('#shareLink')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch (_) {
      /* noop */
    }
  });

  const presets = {
    startup: {
      tenants: 8,
      chgRate: 40,
      payload: 700,
      envelope: 300,
      topicsPerTenant: 4,
      sharedTopics: 6,
      isolation: 'shared'
    },
    regulated: {
      tenants: 40,
      chgRate: 120,
      payload: 900,
      envelope: 350,
      topicsPerTenant: 8,
      sharedTopics: 8,
      isolation: 'perTenantTopics'
    },
    noisy: {
      tenants: 25,
      chgRate: 600,
      payload: 1200,
      envelope: 350,
      topicsPerTenant: 6,
      sharedTopics: 6,
      isolation: 'perTenantClusters'
    }
  };

  doc.addEventListener('click', (event) => {
    const preset = event.target?.dataset?.preset;
    if (!preset || !presets[preset]) return;
    for (const [key, value] of Object.entries(presets[preset])) {
      if (I[key]) {
        I[key].value = value;
      }
    }
    reflect();
    calc();
    writeParams(false);
  });

  doc.addEventListener('input', (event) => {
    if (!event.target) return;
    if (PARAMS.includes(event.target.id)) {
      reflect();
      calc();
      writeParams(false);
    }
  });

  I.isolation.addEventListener('change', () => {
    reflect();
    calc();
    writeParams(false);
  });

  const observer = chartCanvas
    ? new IntersectionObserver((entries, obs) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          updateChart();
          obs.disconnect();
        }
      })
    : null;

  if (observer && chartCanvas) {
    observer.observe(chartCanvas);
  }

  window.addEventListener('resize', () => {
    if (chartCanvas && chartValues.some((v) => v > 0)) {
      updateChart();
    }
  });

  readParams();
  reflect();
  calc();
  writeParams(true);
});
