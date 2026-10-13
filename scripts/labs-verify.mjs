#!/usr/bin/env node
/**
 * Run a docker-compose lab and check what its documentation claims (P17-25).
 *
 *   node scripts/labs-verify.mjs [--lab postgres-sandbox] [--logs labs-verify-logs]
 *                                [--keep] [--plan]
 *
 * The lab is `compose.yaml` driven by `sandbox/README.md`: bring up
 * zookeeper, kafka, connect, postgres and kcat, wait for Kafka Connect,
 * check the seed row count, register the documented Postgres connector with
 * `sandbox/register-postgres-connector.sh`, wait until the connector and its
 * task are RUNNING, run the documented UPDATE, and read the change event back
 * with kcat. Exit 0 only if every step passed; every step is written to
 * `<logs>/steps.log` and the compose logs to `<logs>/compose.log`.
 *
 * Out of scope on purpose (see the workflow): the MySQL path, Kafka UI, the
 * observability compose files, `playground/` harness compose files (they have
 * their own workflows) and the cloud labs (vendor accounts needed).
 *
 * The parsing and decision functions are pure and exported for
 * tests/unit/labs-verify.test.js. Nothing here needs a dependency or a secret.
 * `--plan` prints the steps without running Docker.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SEED_PRODUCTS = 5; // sandbox/README.md: "5 products"
export const UPDATED_WEIGHT = 3; // README: SET weight = 3.0 WHERE id = 1
export const CONNECTOR_NAME = "postgres-inventory-connector";
export const TOPIC = "dbserver1.public.products";
export const SERVICES = ["zookeeper", "kafka", "connect", "postgres", "kcat"];

/** Parse the output of `psql -tA -c "SELECT COUNT(*) ..."` into a number. */
export function parseCount(output) {
  const lines = String(output ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines.at(-1);
  if (last === undefined || !/^\d+$/.test(last)) return null;
  return Number(last);
}

/** Decide a seed-count check. */
export function evaluateSeedCount(count, expected = SEED_PRODUCTS) {
  if (count === null)
    return { ok: false, reason: "no row count in psql output" };
  if (count !== expected) {
    return {
      ok: false,
      reason: `products has ${count} rows, the README says ${expected}`,
    };
  }
  return { ok: true, reason: `products has ${count} rows` };
}

/** Decide from the body of GET /connectors/<name>/status. */
export function evaluateConnectorStatus(status) {
  if (!status || typeof status !== "object") {
    return { ok: false, reason: "no status object" };
  }
  const state = status.connector?.state;
  if (state !== "RUNNING") {
    return { ok: false, reason: `connector state is ${state ?? "missing"}` };
  }
  const tasks = Array.isArray(status.tasks) ? status.tasks : [];
  if (tasks.length === 0)
    return { ok: false, reason: "connector has no tasks" };
  const bad = tasks.find((t) => t.state !== "RUNNING");
  if (bad) {
    return { ok: false, reason: `task ${bad.id} is ${bad.state}` };
  }
  return { ok: true, reason: `connector and ${tasks.length} task(s) RUNNING` };
}

/** Parse `kcat -f '%s\n'` output: one JSON value per line; others are skipped. */
export function parseKcatEvents(output) {
  const events = [];
  for (const line of String(output ?? "").split("\n")) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      events.push(JSON.parse(text));
    } catch {
      // A truncated or non-JSON line is not an event.
    }
  }
  return events;
}

/**
 * Decide from parsed change events. The converters run with schemas off, so
 * an event is the flat envelope { before, after, source, op }. Expect the
 * snapshot reads (op "r") for every seed row and the documented UPDATE
 * (op "u", id 1, weight 3.0).
 */
export function evaluateChangeEvents(
  events,
  { seed = SEED_PRODUCTS, weight = UPDATED_WEIGHT } = {},
) {
  const list = Array.isArray(events) ? events : [];
  const snapshot = new Set(
    list.filter((e) => e?.op === "r").map((e) => e.after?.id),
  );
  const update = list.find(
    (e) =>
      e?.op === "u" && e.after?.id === 1 && Number(e.after?.weight) === weight,
  );
  const problems = [];
  if (snapshot.size < seed)
    problems.push(`${snapshot.size} snapshot rows (op r), expected ${seed}`);
  if (!update)
    problems.push(`no update event (op u) for id 1 with weight ${weight}`);
  if (update && !update.source?.lsn)
    problems.push("update event has no source.lsn");
  if (problems.length > 0) return { ok: false, reason: problems.join("; ") };
  return {
    ok: true,
    reason: `${snapshot.size} snapshot rows, update at lsn ${update.source.lsn}`,
  };
}

/** Image references pinned in a compose file, for the run log. */
export function parseComposeImages(text) {
  const images = [];
  let service = null;
  for (const line of String(text).split("\n")) {
    const s = line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (s) service = s[1];
    const i = line.match(/^ {4}image:\s*(\S+)/);
    if (i && service) images.push({ service, image: i[1] });
  }
  return images;
}

/**
 * Call `attempt` until it returns { ok: true } or the time is up. `now` and
 * `sleep` are injectable so tests need no real clock.
 */
export async function pollUntil(
  attempt,
  {
    timeoutMs,
    intervalMs,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  },
) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const last = await attempt();
    if (last.ok) return last;
    if (now() + intervalMs > deadline) {
      return {
        ok: false,
        reason: `timed out after ${timeoutMs} ms: ${last.reason}`,
      };
    }
    await sleep(intervalMs);
  }
}

export function buildPlan(connectUrl = "http://localhost:8083") {
  return [
    `docker compose up -d ${SERVICES.join(" ")}`,
    `poll GET ${connectUrl}/ until 200 (180 s)`,
    `psql: SELECT COUNT(*) FROM products == ${SEED_PRODUCTS}`,
    "sandbox/register-postgres-connector.sh",
    `poll GET ${connectUrl}/connectors/${CONNECTOR_NAME}/status until RUNNING (120 s)`,
    `psql: UPDATE products SET weight = ${UPDATED_WEIGHT.toFixed(1)} WHERE id = 1`,
    `kcat -C -t ${TOPIC} -o beginning -e until the update event shows (90 s)`,
    "docker compose logs; docker compose down -v --remove-orphans",
  ];
}

// ---------------------------------------------------------------------------
// Runner (needs Docker; not unit-tested, proven by the workflow run).
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    lab: "postgres-sandbox",
    logs: "labs-verify-logs",
    keep: false,
    plan: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lab") opts.lab = argv[++i];
    else if (a === "--logs") opts.logs = argv[++i];
    else if (a === "--keep") opts.keep = true;
    else if (a === "--plan") opts.plan = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const opts = parseArgs(process.argv.slice(2));
  if (opts.lab !== "postgres-sandbox") {
    throw new Error(
      `unknown lab "${opts.lab}"; only postgres-sandbox is supported`,
    );
  }
  const connectUrl = process.env.CONNECT_URL || "http://localhost:8083";
  if (opts.plan) {
    process.stdout.write(`${buildPlan(connectUrl).join("\n")}\n`);
    return 0;
  }

  const logDir = path.resolve(opts.logs);
  mkdirSync(logDir, { recursive: true });
  const stepsLog = path.join(logDir, "steps.log");
  writeFileSync(stepsLog, "");
  const say = (msg) => {
    process.stdout.write(`${msg}\n`);
    appendFileSync(stepsLog, `${msg}\n`);
  };
  const sh = (cmd, args, extra = {}) =>
    spawnSync(cmd, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      ...extra,
    });
  const compose = (args, extra) => sh("docker", ["compose", ...args], extra);

  const results = [];
  const step = async (name, fn) => {
    const started = Date.now();
    let r;
    try {
      r = await fn();
    } catch (error) {
      r = { ok: false, reason: String(error?.message ?? error) };
    }
    results.push({ name, ...r });
    say(
      `${r.ok ? "PASS" : "FAIL"}  ${name} (${Math.round((Date.now() - started) / 1000)} s): ${r.reason}`,
    );
    return r.ok;
  };
  const getJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  };

  say(`labs-verify ${opts.lab} at ${new Date().toISOString()}`);
  for (const key of ["ImageOS", "ImageVersion", "RUNNER_OS", "RUNNER_ARCH"]) {
    if (process.env[key]) say(`env ${key}=${process.env[key]}`);
  }
  say(`node ${process.version}`);
  say(
    `docker: ${(sh("docker", ["--version"]).stdout || "unavailable").trim()}`,
  );
  say(
    `compose: ${(compose(["version", "--short"]).stdout || "unavailable").trim()}`,
  );
  for (const { service, image } of parseComposeImages(
    readFileSync(path.join(root, "compose.yaml"), "utf8"),
  )) {
    say(`image ${service}: ${image}`);
  }

  let ok = await step("compose up", () => {
    const r = compose(["up", "-d", ...SERVICES]);
    appendFileSync(
      path.join(logDir, "compose-up.log"),
      `${r.stdout}\n${r.stderr}\n`,
    );
    return r.status === 0
      ? { ok: true, reason: SERVICES.join(", ") }
      : { ok: false, reason: `exit ${r.status}` };
  });

  const psql = (sql) =>
    compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "inventory",
      "-tA",
      "-c",
      sql,
    ]);

  ok =
    ok &&
    (await step("kafka connect answers", () =>
      pollUntil(
        async () => {
          try {
            const body = await getJson(`${connectUrl}/`);
            return { ok: true, reason: `Connect ${body.version ?? "?"}` };
          } catch (error) {
            return { ok: false, reason: String(error.message ?? error) };
          }
        },
        { timeoutMs: 180_000, intervalMs: 5_000 },
      ),
    ));
  ok =
    ok &&
    (await step("seed data (README: 5 products)", () => {
      const r = psql("SELECT COUNT(*) FROM products;");
      return r.status === 0
        ? evaluateSeedCount(parseCount(r.stdout))
        : { ok: false, reason: `psql exit ${r.status}: ${r.stderr}` };
    }));
  ok =
    ok &&
    (await step("register postgres connector (documented script)", () => {
      const r = sh("bash", ["sandbox/register-postgres-connector.sh"], {
        env: { ...process.env, CONNECT_URL: connectUrl },
      });
      appendFileSync(
        path.join(logDir, "register.log"),
        `${r.stdout}\n${r.stderr}\n`,
      );
      const created = /HTTP\/\S+ 201/.test(r.stdout);
      return r.status === 0 && created
        ? { ok: true, reason: "HTTP 201" }
        : { ok: false, reason: `exit ${r.status}, 201 seen: ${created}` };
    }));
  ok =
    ok &&
    (await step("connector and task RUNNING", () =>
      pollUntil(
        async () => {
          try {
            return evaluateConnectorStatus(
              await getJson(
                `${connectUrl}/connectors/${CONNECTOR_NAME}/status`,
              ),
            );
          } catch (error) {
            return { ok: false, reason: String(error.message ?? error) };
          }
        },
        { timeoutMs: 120_000, intervalMs: 3_000 },
      ),
    ));
  ok =
    ok &&
    (await step("documented UPDATE", () => {
      const r = psql(
        `UPDATE products SET weight = ${UPDATED_WEIGHT.toFixed(1)} WHERE id = 1;`,
      );
      return r.status === 0 && /UPDATE 1/.test(r.stdout)
        ? { ok: true, reason: "UPDATE 1" }
        : { ok: false, reason: `exit ${r.status}: ${r.stdout}${r.stderr}` };
    }));
  ok =
    ok &&
    (await step("change event read back with kcat", () =>
      pollUntil(
        async () => {
          const r = compose([
            "exec",
            "-T",
            "kcat",
            "kcat",
            "-b",
            "kafka:29092",
            "-C",
            "-t",
            TOPIC,
            "-o",
            "beginning",
            "-e",
            "-q",
            "-f",
            "%s\\n",
          ]);
          writeFileSync(
            path.join(logDir, "kcat.log"),
            `${r.stdout}\n${r.stderr}`,
          );
          if (r.status !== 0)
            return { ok: false, reason: `kcat exit ${r.status}` };
          return evaluateChangeEvents(parseKcatEvents(r.stdout));
        },
        { timeoutMs: 90_000, intervalMs: 5_000 },
      ),
    ));

  const logs = compose(["logs", "--no-color", "--timestamps"]);
  writeFileSync(
    path.join(logDir, "compose.log"),
    `${logs.stdout}\n${logs.stderr}`,
  );
  if (!opts.keep) {
    const down = compose(["down", "-v", "--remove-orphans"]);
    say(`teardown: exit ${down.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  say(
    `${results.length - failed.length}/${results.length} steps passed${ok ? "" : "; first failure above"}`,
  );
  return failed.length === 0 && ok ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exit(2);
    },
  );
}
