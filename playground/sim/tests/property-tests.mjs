import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundlePath = path.resolve(__dirname, '../../assets/generated/sim-bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error('[property-tests] Build artefact missing. Run `npm run build:sim` before `npm run test:sim`.');
  process.exit(1);
}

const bundle = await import(pathToFileURL(bundlePath));

const {
  ScenarioRunner,
  PollingEngine,
  TriggerEngine,
  LogEngine,
  diffLane,
} = bundle;

if (!ScenarioRunner || !PollingEngine || !TriggerEngine || !LogEngine || !diffLane) {
  console.error('[property-tests] Simulator bundle missing expected exports. Rebuild the sim artefact.');
  process.exit(1);
}

function createRng(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function pick(list, rng) {
  const index = Math.floor(rng() * list.length);
  return list[index];
}

function generateRow(id, rng) {
  const customers = ['Acme', 'Globex', 'Initech', 'Umbra', 'Soylent'];
  const statuses = ['pending', 'processing', 'complete', 'cancelled'];
  return {
    id,
    customer: pick(customers, rng),
    status: pick(statuses, rng),
    amount: Number((rng() * 1000).toFixed(2)),
  };
}

function generateScenario(seed) {
  const rng = createRng(seed * 97);
  const ops = [];
  const active = new Map();
  let t = 0;
  let nextId = 1;
  const totalOps = Math.floor(rng() * 12) + 6; // 6-17 operations

  const stepTime = () => {
    t += Math.floor(rng() * 220) + 40;
    return t;
  };

  for (let i = 0; i < totalOps; i++) {
    let opType = 'insert';
    const activeIds = [...active.keys()];
    if (activeIds.length > 0) {
      const roll = rng();
      if (roll < 0.45) opType = 'insert';
      else if (roll < 0.8) opType = 'update';
      else opType = 'delete';
    }

    if (opType === 'insert' || active.size === 0) {
      const id = `R-${seed}-${nextId++}`;
      const row = generateRow(id, rng);
      active.set(id, row);
      ops.push({
        t: stepTime(),
        op: 'insert',
        table: 'customers',
        pk: { id },
        after: row,
      });
    } else if (opType === 'update') {
      const id = pick(activeIds, rng);
      const current = active.get(id) || generateRow(id, rng);
      const patch = {
        status: rng() > 0.5 ? pick(['pending', 'processing', 'complete', 'cancelled'], rng) : current.status,
        amount: Number((current.amount + (rng() - 0.5) * 120).toFixed(2)),
      };
      const next = { ...current, ...patch };
      active.set(id, next);
      ops.push({
        t: stepTime(),
        op: 'update',
        table: 'customers',
        pk: { id },
        after: patch,
      });
    } else if (opType === 'delete') {
      const id = pick(activeIds, rng);
      active.delete(id);
      ops.push({
        t: stepTime(),
        op: 'delete',
        table: 'customers',
        pk: { id },
      });
    }
  }

  if (!ops.some(op => op.op === 'delete') && active.size > 0) {
    const [id] = active.keys();
    active.delete(id);
    ops.push({
      t: stepTime(),
      op: 'delete',
      table: 'customers',
      pk: { id },
    });
  }

  return {
    name: `property-${seed}`,
    seed,
    ops,
  };
}

function runScenario(scenario) {
  const runner = new ScenarioRunner();
  const polling = new PollingEngine();
  const trigger = new TriggerEngine();
  const log = new LogEngine();

  polling.configure({ poll_interval_ms: 200, include_soft_deletes: true });
  trigger.configure({ extract_interval_ms: 150, trigger_overhead_ms: 6 });
  log.configure({ fetch_interval_ms: 25 });

  const lanes = new Map([
    ['polling', { engine: polling, events: [] }],
    ['trigger', { engine: trigger, events: [] }],
    ['log', { engine: log, events: [] }],
  ]);

  lanes.forEach(({ engine, events }) => {
    engine.onEvent(evt => events.push(evt));
  });

  runner.attach([...lanes.values()].map(item => item.engine));
  runner.load(scenario);
  runner.reset(scenario.seed);
  runner.onTick(() => {});
  runner.start();

  const lastOpTime = scenario.ops.length ? scenario.ops[scenario.ops.length - 1].t : 0;
  const horizon = lastOpTime + 2000;
  for (let elapsed = 0; elapsed <= horizon; elapsed += 50) {
    runner.tick(50);
  }
  runner.pause();

  return lanes;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNonDecreasing(events, method) {
  for (let i = 1; i < events.length; i++) {
    assert(
      events[i].ts_ms >= events[i - 1].ts_ms,
      `${method}: events out of order at index ${i} (${events[i - 1].ts_ms} -> ${events[i].ts_ms})`,
    );
  }
}

// --- Redelivery (at-least-once) properties -------------------------------
// Row ops are sorted by t. Redelivery ops are appended after the last write,
// each naming a random earlier row op by index (`ref`), which is how scenario
// files address them.
function withRedeliveries(scenario, seed) {
  const rng = createRng(seed * 31 + 7);
  const rowOps = scenario.ops;
  const lastT = rowOps.length ? rowOps[rowOps.length - 1].t : 0;
  const ops = [...rowOps];
  const count = Math.floor(rng() * 4) + 1;
  for (let i = 0; i < count; i++) {
    const ref = Math.floor(rng() * rowOps.length);
    ops.push({
      t: lastT + 400 + i * 50,
      op: 'redeliver',
      ref,
      table: rowOps[ref].table,
      pk: rowOps[ref].pk,
    });
  }
  return { ...scenario, name: `${scenario.name}-redeliver`, ops };
}

// What the source holds after the row ops (redeliveries write nothing).
function sourceFinalState(ops) {
  const state = new Map();
  for (const op of ops) {
    if (op.op === 'insert') state.set(op.pk.id, { ...op.after });
    else if (op.op === 'update') state.set(op.pk.id, { ...(state.get(op.pk.id) ?? {}), ...op.after });
    else if (op.op === 'delete') state.delete(op.pk.id);
  }
  return state;
}

// Sinks. Both are keyed on the primary key. `naive` applies every delivery in
// arrival order. `positionGuarded` applies a delivery only if its log position
// (tx.lsn) is newer than the last one applied for that key.
function applyToSink(state, evt) {
  if (evt.op === 'd') state.delete(evt.pk.id);
  else state.set(evt.pk.id, { ...(state.get(evt.pk.id) ?? {}), ...(evt.after ?? {}) });
}

function runSinks(events) {
  const naive = new Map();
  const guarded = new Map();
  const lastPosition = new Map();
  let naiveApplied = 0;
  let guardedApplied = 0;
  for (const evt of events) {
    applyToSink(naive, evt);
    naiveApplied += 1;
    const last = lastPosition.get(evt.pk.id) ?? -Infinity;
    if (evt.tx.lsn > last) {
      lastPosition.set(evt.pk.id, evt.tx.lsn);
      applyToSink(guarded, evt);
      guardedApplied += 1;
    }
  }
  return { naive, guarded, naiveApplied, guardedApplied };
}

function assertSameState(actual, expected, label) {
  assert(actual.size === expected.size, `${label}: ${actual.size} rows, expected ${expected.size}`);
  for (const [id, row] of expected) {
    const got = actual.get(id);
    assert(got !== undefined, `${label}: row ${id} missing`);
    for (const [key, value] of Object.entries(row)) {
      assert(got[key] === value, `${label}: ${id}.${key} is ${got[key]}, expected ${value}`);
    }
  }
}

const seedsPath = path.resolve(__dirname, "seeds.json");
let seeds = [];
try {
  const raw = fs.readFileSync(seedsPath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed) && parsed.length) {
    seeds = parsed.map(Number).filter(Number.isFinite);
  }
} catch (err) {
  console.warn("[property-tests] Failed to load seeds.json", err?.message || err);
}

if (!seeds.length) {
  seeds = Array.from({ length: 24 }, (_, index) => index + 11);
}

const envSeeds = process.env.SIM_SEEDS;
if (envSeeds) {
  seeds = envSeeds.split(",").map(value => Number(value.trim())).filter(Number.isFinite);
}
const failures = [];
let naiveDivergedSeeds = 0;

for (const seed of seeds) {
  try {
    const scenario = generateScenario(seed);
    const lanes = runScenario(scenario);

    const polling = lanes.get('polling').events;
    const trigger = lanes.get('trigger').events;
    const log = lanes.get('log').events;

    assertNonDecreasing(trigger, 'trigger');
    assertNonDecreasing(log, 'log');

    const diffPolling = diffLane('polling', scenario.ops, polling);
    const diffTrigger = diffLane('trigger', scenario.ops, trigger);
    const diffLog = diffLane('log', scenario.ops, log);

    assert(diffPolling.totals.extra === 0, 'polling produced unexpected extra events');
    assert(diffTrigger.totals.missing === 0 && diffTrigger.totals.extra === 0, 'trigger diverged from source ops');
    assert(diffLog.totals.missing === 0 && diffLog.totals.extra === 0, 'log diverged from source ops');
    assert(diffTrigger.totals.ordering === 0, 'trigger ordering drift');
    assert(diffLog.totals.ordering === 0, 'log ordering drift');

    const expectedDeletes = scenario.ops.filter(op => op.op === 'delete').length;
    const triggerDeletes = trigger.filter(evt => evt.op === 'd').length;
    const logDeletes = log.filter(evt => evt.op === 'd').length;
    const pollingDeletes = polling.filter(evt => evt.op === 'd').length;

    assert(triggerDeletes === expectedDeletes, `trigger delete capture mismatch (${triggerDeletes} vs ${expectedDeletes})`);
    assert(logDeletes === expectedDeletes, `log delete capture mismatch (${logDeletes} vs ${expectedDeletes})`);
    assert(pollingDeletes <= expectedDeletes, 'polling emitted more deletes than source ops');

    // At-least-once redelivery on the log lane.
    {
      const replay = withRedeliveries(scenario, seed);
      const replayLanes = runScenario(replay);
      const replayLog = replayLanes.get('log').events;
      const replayPolling = replayLanes.get('polling').events;
      const replayTrigger = replayLanes.get('trigger').events;
      const repeats = replayLog.filter(evt => evt.redelivered);
      const originals = replayLog.filter(evt => !evt.redelivered);
      const redeliverOps = replay.ops.filter(op => op.op === 'redeliver').length;

      assert(repeats.length === redeliverOps, `log redeliveries ${repeats.length} vs ${redeliverOps} ops`);
      assert(originals.length === scenario.ops.length, 'redelivery changed the number of original log events');
      // Preserved position: every repeat has the lsn, payload and ts_ms of an original.
      for (const repeat of repeats) {
        const original = originals.find(evt => evt.tx.lsn === repeat.tx.lsn);
        assert(original, `redelivered lsn ${repeat.tx.lsn} has no original`);
        assert(original.op === repeat.op && original.pk.id === repeat.pk.id, 'redelivery changed op or key');
        assert(JSON.stringify(original.after) === JSON.stringify(repeat.after), 'redelivery changed the payload');
        assert(original.ts_ms === repeat.ts_ms, 'redelivery changed ts_ms');
      }
      // The other lanes ignore it, and the lane diff does not flag it as extra.
      assert(replayPolling.length === polling.length, 'polling lane reacted to a redelivery');
      assert(replayTrigger.length === trigger.length, 'trigger lane reacted to a redelivery');
      const replayDiff = diffLane('log', replay.ops, replayLog);
      assert(replayDiff.totals.missing === 0 && replayDiff.totals.extra === 0, 'redelivery showed up as a diff');

      const expected = sourceFinalState(scenario.ops);
      const sinks = runSinks(replayLog);
      assertSameState(sinks.guarded, expected, 'position-guarded sink');
      assert(sinks.guardedApplied === scenario.ops.length, 'guarded sink applied a repeat');
      assert(sinks.naiveApplied === scenario.ops.length + redeliverOps, 'naive sink should apply every delivery');
      // Without a guard the last delivery wins, so a replay of an earlier write
      // after a later one leaves the naive sink on the older value or a revived row.
      const naiveDiffers = (() => {
        try {
          assertSameState(sinks.naive, expected, 'naive sink');
          return false;
        } catch {
          return true;
        }
      })();
      const repeatWasStale = repeats.some(repeat => {
        const lastForKey = [...originals].reverse().find(evt => evt.pk.id === repeat.pk.id);
        return lastForKey && lastForKey.tx.lsn > repeat.tx.lsn;
      });
      if (naiveDiffers) naiveDivergedSeeds += 1;
      if (!repeatWasStale) {
        assert(!naiveDiffers, 'naive sink diverged although every repeat was the latest write for its key');
      }
    }

    assert(diffTrigger.lag.max <= 50, `trigger lag spike ${diffTrigger.lag.max}ms`);
    assert(diffLog.lag.max <= 5, `log lag spike ${diffLog.lag.max}ms`);
  } catch (error) {
    failures.push({ seed, error });
  }
}

if (!failures.length && !envSeeds && naiveDivergedSeeds === 0) {
  failures.push({ seed: 'all', error: new Error('no generated scenario made the naive sink diverge; the redelivery property has no teeth') });
}

if (failures.length) {
  console.error(`❌ Property tests failed for ${failures.length} seed(s).`);
  failures.forEach(failure => {
    console.error(`  Seed ${failure.seed}: ${failure.error.message}`);
  });
  process.exit(1);
}

console.log(`✅ Property-based CDC invariants passed for ${seeds.length} generated scenarios (naive sink diverged after redelivery in ${naiveDivergedSeeds}).`);
