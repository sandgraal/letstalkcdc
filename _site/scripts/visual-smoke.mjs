import { createHash } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chartsModulePath = pathToFileURL(resolve(__dirname, '../src/assets/js/lib/charts.js')).href;
const { drawBarChart, drawRadarChart } = await import(chartsModulePath);

const hashOps = (ops) => createHash('sha256').update(JSON.stringify(ops)).digest('hex');

class MockContext {
  constructor() {
    this.ops = [];
    this._fillStyle = null;
    this._strokeStyle = null;
    this._font = null;
    this._textAlign = null;
    this._textBaseline = null;
    this._lineWidth = null;
    this._globalAlpha = 1;
  }

  _record(op, data = {}) {
    this.ops.push({ op, ...data });
  }

  setTransform(...args) { this._record('setTransform', { args }); }
  clearRect(...args) { this._record('clearRect', { args }); }
  beginPath() { this._record('beginPath'); }
  moveTo(...args) { this._record('moveTo', { args }); }
  lineTo(...args) { this._record('lineTo', { args }); }
  stroke() { this._record('stroke'); }
  fill() { this._record('fill'); }
  closePath() { this._record('closePath'); }
  save() { this._record('save'); }
  restore() { this._record('restore'); }
  translate(...args) { this._record('translate', { args }); }
  rotate(...args) { this._record('rotate', { args }); }
  fillText(...args) { this._record('fillText', { args }); }
  strokeRect(...args) { this._record('strokeRect', { args }); }
  fillRect(...args) { this._record('fillRect', { args }); }
  arc(...args) { this._record('arc', { args }); }
  quadraticCurveTo(...args) { this._record('quadraticCurveTo', { args }); }
  setLineDash(args) { this._record('setLineDash', { args: Array.from(args) }); }

  createLinearGradient(...args) {
    const gradient = { stops: [] };
    this._record('createLinearGradient', { args, gradient: gradient.stops });
    return {
      stops: gradient.stops,
      addColorStop: (offset, color) => gradient.stops.push({ offset, color })
    };
  }

  set fillStyle(value) {
    const serialised = value && value.stops ? value.stops : value;
    this._fillStyle = serialised;
    this._record('setFillStyle', { value: serialised });
  }
  get fillStyle() { return this._fillStyle; }

  set strokeStyle(value) {
    this._strokeStyle = value;
    this._record('setStrokeStyle', { value });
  }
  get strokeStyle() { return this._strokeStyle; }

  set font(value) {
    this._font = value;
    this._record('setFont', { value });
  }
  get font() { return this._font; }

  set textAlign(value) {
    this._textAlign = value;
    this._record('setTextAlign', { value });
  }
  get textAlign() { return this._textAlign; }

  set textBaseline(value) {
    this._textBaseline = value;
    this._record('setTextBaseline', { value });
  }
  get textBaseline() { return this._textBaseline; }

  set lineWidth(value) {
    this._lineWidth = value;
    this._record('setLineWidth', { value });
  }
  get lineWidth() { return this._lineWidth; }

  set globalAlpha(value) {
    this._globalAlpha = value;
    this._record('setGlobalAlpha', { value });
  }
  get globalAlpha() { return this._globalAlpha; }
}

const createMockCanvas = (width = 640, height = 280) => {
  const ctx = new MockContext();
  let internalWidth = width;
  let internalHeight = height;
  return {
    clientWidth: width,
    parentElement: { clientWidth: width },
    getContext(type) {
      if (type !== '2d') throw new Error('Only 2d contexts supported in mock');
      return ctx;
    },
    set width(value) { internalWidth = value; },
    get width() { return internalWidth; },
    set height(value) { internalHeight = value; },
    get height() { return internalHeight; },
    _ctx: ctx
  };
};

const BAR_EXPECTED_HASH = '87c562186949ab0a652caa04324722322c4d5dbb55fba7cdb2df009e395fe001';
const RADAR_EXPECTED_HASH = '423801e12384d5d08ef998a871cb98f0968263f0cec3e7463ba925eab0b21f00';

const barCanvas = createMockCanvas(640, 280);
const barPalette = {
  axis: '#334155',
  grid: 'rgba(148, 163, 184, 0.35)',
  text: '#64748b',
  textMuted: '#94a3b8',
  textStrong: '#0f172a',
  bars: [
    { soft: 'rgba(14, 165, 233, 0.35)', strong: 'rgba(14, 165, 233, 0.95)' },
    { soft: 'rgba(250, 204, 21, 0.35)', strong: 'rgba(250, 204, 21, 0.95)' },
    { soft: 'rgba(248, 113, 113, 0.35)', strong: 'rgba(248, 113, 113, 0.95)' }
  ]
};

drawBarChart(barCanvas, [42, 73, 96], ['Shared', 'Topics', 'Clusters'], barPalette);
const barHash = hashOps(barCanvas._ctx.ops);

const radarCanvas = createMockCanvas(640, 420);
const radarPalette = {
  axis: '#2a3341',
  grid: 'rgba(148, 163, 184, 0.25)',
  text: '#94a3b8',
  background: '#ffffff'
};

drawRadarChart(radarCanvas, {
  labels: ['Completeness', 'Low Impact', 'Low Latency', 'Low Maintenance', 'Ease'],
  datasets: [
    { label: 'Log-Based', data: [5, 5, 5, 4, 2], color: '#14b8a6', fillAlpha: 0.18 },
    { label: 'Trigger-Based', data: [4, 3, 4, 2, 3], color: '#3b82f6', fillAlpha: 0.14 },
    { label: 'Query-Based', data: [1, 2, 1, 2, 5], color: '#ef4444', fillAlpha: 0.12 }
  ],
  palette: radarPalette,
  height: 420
});
const radarHash = hashOps(radarCanvas._ctx.ops);

const failures = [];

if (barHash !== BAR_EXPECTED_HASH) {
  failures.push(`Bar chart render hash mismatch. Expected ${BAR_EXPECTED_HASH}, got ${barHash}.`);
}

if (radarHash !== RADAR_EXPECTED_HASH) {
  failures.push(`Radar chart render hash mismatch. Expected ${RADAR_EXPECTED_HASH}, got ${radarHash}.`);
}

if (failures.length) {
  console.error('Visual smoke failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Visual smoke passed: render operations match expected fingerprints.');
