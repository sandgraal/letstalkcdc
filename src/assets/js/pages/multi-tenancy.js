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
    /* fall through to local */
  }
  await loadScript('/assets/js/vendor/chart.umd.js');
  return window.Chart;
};

onReady(async () => {
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

  let chart;
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
    if (chart) {
      chart.data.datasets[0].data = [c0, c1, c2];
      chart.update();
    }
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
      return [...el.options].some((o) => o.value === value) ? value : el.value;
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

  let observerActivated = false;
  const initChart = async () => {
    if (observerActivated) return;
    observerActivated = true;
    const ChartModule = await ensureChart();
    if (!ChartModule) return;
    const ctx = $('#costChart')?.getContext('2d');
    if (!ctx) return;
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Shared Topics', 'Per-Tenant Topics', 'Per-Tenant Cluster'],
        datasets: [
          {
            label: 'Cost/Complexity Index (illustrative)',
            data: [0, 0, 0],
            backgroundColor: [
              'rgba(54, 162, 235, 0.6)',
              'rgba(255, 206, 86, 0.6)',
              'rgba(255, 99, 132, 0.6)'
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(255, 99, 132, 1)'
            ],
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Illustrative Cost/Complexity by Isolation Model'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `Index: ${ctx.formattedValue} (egress + footprint + mgmt)`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Index (unitless)' }
          }
        }
      }
    });
    calc();
  };

  const chartCanvas = $('#costChart');
  if (chartCanvas) {
    new IntersectionObserver((entries, observer) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        initChart();
        observer.disconnect();
      }
    }).observe(chartCanvas);
  }

  readParams();
  reflect();
  calc();
  writeParams(true);
});
