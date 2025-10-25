const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

onReady(() => {
  const $ = (selector) => doc.querySelector(selector);
  const parts = $('#sPartitions');
  const keys = $('#sKeys');
  const rate = $('#sRate');
  const dist = $('#sDist');
  const hot = $('#sHot');
  const cap = $('#sCapacity');
  const shards = $('#sShards');

  if (!parts || !keys || !rate || !dist || !hot || !cap || !shards) {
    return;
  }

  const out = {
    parts: $('#sPartitionsOut'),
    keys: $('#sKeysOut'),
    rate: $('#sRateOut'),
    hot: $('#sHotOut'),
    shards: $('#sShardsOut'),
    max: $('#kMaxPart'),
    p95: $('#kP95'),
    lag: $('#kLag'),
    bars: $('#bars'),
    ordering: $('#kOrdering')
  };

  const reflect = () => {
    out.parts && (out.parts.textContent = parts.value);
    out.keys && (out.keys.textContent = keys.value);
    out.rate && (out.rate.textContent = rate.value);
    out.hot && (out.hot.textContent = `${hot.value}%`);
    const capacityOut = $('#sCapacityOut');
    if (capacityOut) capacityOut.textContent = cap.value;
    out.shards && (out.shards.textContent = shards.value);
  };

  const hash32 = (value) => {
    let x = value >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };

  const simulate = () => {
    const P = +parts.value;
    const K = +keys.value;
    const R = +rate.value;
    const C = +cap.value;
    const D = dist.value;
    const H = +hot.value / 100;
    const S = Math.max(1, +shards.value);

    const weights = new Float64Array(K);
    if (D === 'uniform') {
      for (let i = 0; i < K; i++) weights[i] = 1;
    } else if (D === 'zipf') {
      const s = 1.2;
      let z = 0;
      for (let r = 1; r <= K; r++) z += 1 / r ** s;
      for (let r = 1; r <= K; r++) weights[r - 1] = (1 / r ** s / z) * K;
    } else {
      weights[0] = Math.max(H, 0);
      const remainder = Math.max(1 - H, 0);
      const per = remainder / Math.max(K - 1, 1);
      for (let i = 1; i < K; i++) weights[i] = per;
    }

    const partRate = new Float64Array(P);
    let sumWeights = 0;
    for (let i = 0; i < K; i++) sumWeights += weights[i];

    for (let i = 0; i < K; i++) {
      const share = (weights[i] / sumWeights) * R;
      if (dist.value === 'hot' && i === 0 && S > 1) {
        for (let s = 0; s < S; s++) {
          const p = hash32(((i + 1) * 2654435761) ^ s) % P;
          partRate[p] += share / S;
        }
      } else {
        const p = hash32(i + 1) % P;
        partRate[p] += share;
      }
    }

    const arr = Array.from(partRate).sort((a, b) => a - b);
    const max = arr[arr.length - 1] || 0;
    const p95 = arr[Math.max(0, Math.floor(0.95 * arr.length) - 1)] || 0;
    const backlog = Math.max(0, max - C) * 60;
    const drain = backlog > 0 ? backlog / Math.max(C, 1) : 0;

    out.max && (out.max.textContent = Math.round(max).toLocaleString());
    out.p95 && (out.p95.textContent = Math.round(p95).toLocaleString());
    out.lag && (out.lag.textContent = drain ? `${drain.toFixed(1)}s` : '0s');
    out.ordering && (out.ordering.textContent = 'Per-key');

    const maxBar = Math.max(...partRate, 1);
    if (out.bars) {
      out.bars.innerHTML = '';
      partRate.forEach((value, index) => {
        const wrap = doc.createElement('div');
        wrap.className = 'bar-wrap';

        const label = doc.createElement('div');
        label.className = 'bar-label';
        label.textContent = `P${index}`;

        const bar = doc.createElement('div');
        bar.className = 'bar';
        bar.style.width = `${Math.max(2, (value / maxBar) * 100)}%`;
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', `Partition ${index}: ${Math.round(value)} events/sec`);

        const val = doc.createElement('div');
        val.style.minWidth = '60px';
        val.style.fontFamily = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)";
        val.textContent = Math.round(value).toLocaleString();

        wrap.append(label, bar, val);
        out.bars.appendChild(wrap);
      });
    }
  };

  [parts, keys, rate, dist, hot, cap, shards].forEach((el) => {
    el.addEventListener('input', () => {
      reflect();
      simulate();
    });
  });

  reflect();
  simulate();
});
