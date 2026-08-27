/**
 * Connector Config Builder (/connector-builder/).
 *
 * Generates a Debezium connector config plus the curl command to register it.
 *
 * History: this module used to target an older version of the template and
 * looked up `#host`, `#port`, `#prefix`, `#db-specific`, `#advanced` and wrote
 * its output to `#json`/`#post`/`#put`. None of those exist in the shipped
 * markup, so the guard at the top returned early and the whole tool rendered a
 * permanently empty config box -- silently, with no console error. It is now
 * driven by the IDs the template actually exposes and writes to `#config` and
 * `#curlCmd`.
 *
 * Fields the form does not expose (hostname, port, topic prefix, slot name,
 * server id, PDB, ...) fall back to the same defaults the site's labs and
 * quickstarts use, so the generated config is runnable as-is against this
 * repo's compose stack.
 */

const doc = document;

const onReady = (cb) => {
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", cb, { once: true });
  } else {
    cb();
  }
};

/** Per-source connection defaults matching this repo's compose.yaml + labs. */
const SOURCE_DEFAULTS = {
  postgres: { host: "postgres", port: "5432", dbname: "inventory" },
  mysql: { host: "mysql", port: "3306", dbname: "inventory" },
  oracle: { host: "oracle", port: "1521", dbname: "ORCLCDB" },
};

const TOPIC_PREFIX = "server1";

onReady(() => {
  const $ = (selector) => doc.querySelector(selector);
  const $$ = (selector) => Array.from(doc.querySelectorAll(selector));

  const cname = $("#cname");
  const curl = $("#curl");
  const dbname = $("#dbname");
  const user = $("#user");
  const pass = $("#pass");
  const dlq = $("#dlq");
  const include = $("#include");
  const exclude = $("#exclude");
  const snapshot = $("#snapshot");
  const fetchSize = $("#fetch");
  const taskMax = $("#taskMax");
  const heartbeat = $("#heartbeat");
  const debz = $("#debz");
  const configEl = $("#config");
  const curlEl = $("#curlCmd");

  // Only the elements this module actually writes to are required. Anything
  // else is read defensively so a template tweak degrades a single field
  // rather than silently disabling the entire tool (the previous failure).
  if (!configEl || !curlEl) return;

  let src = "postgres";

  const val = (el, fallback = "") =>
    el && el.value ? el.value.trim() : fallback;

  const csv = (value) =>
    value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .join(",");

  const buildConfig = () => {
    const v2 = val(debz, "2") === "2";
    const defaults = SOURCE_DEFAULTS[src] || SOURCE_DEFAULTS.postgres;

    const base = {
      "tasks.max": val(taskMax, "1"),
      "tombstones.on.delete": "false",
      "include.schema.changes": "false",
      "heartbeat.interval.ms": val(heartbeat, "30000"),
      "snapshot.mode": val(snapshot, "initial"),
      "max.batch.size": val(fetchSize, "2000"),
    };

    // Debezium 2.x renamed database.server.name -> topic.prefix.
    if (v2) base["topic.prefix"] = TOPIC_PREFIX;
    else base["database.server.name"] = TOPIC_PREFIX;

    if (val(include)) base["table.include.list"] = csv(val(include));
    if (val(exclude)) base["table.exclude.list"] = csv(val(exclude));

    if (val(dlq)) {
      base["errors.tolerance"] = "all";
      base["errors.deadletterqueue.topic.name"] = val(dlq);
    }

    const conn = {
      "database.hostname": defaults.host,
      "database.port": defaults.port,
      "database.user": val(user, "inventory"),
      "database.password": val(pass, "inventory"),
    };

    if (src === "postgres") {
      Object.assign(base, conn, {
        "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
        "database.dbname": val(dbname, defaults.dbname),
        // Default to pgoutput (built into Postgres 10+). Debezium's own
        // default is decoderbufs, which needs a separately installed decoder
        // plugin and fails on a stock Postgres.
        "plugin.name": "pgoutput",
        "slot.name": "cdc_slot",
        "publication.autocreate.mode": "filtered",
        "decimal.handling.mode": "string",
      });
    } else if (src === "mysql") {
      Object.assign(base, conn, {
        "connector.class": "io.debezium.connector.mysql.MySqlConnector",
        "database.server.id": "5400",
      });
      if (val(dbname)) base["database.include.list"] = csv(val(dbname));
      // The MySQL connector requires a Kafka-backed schema history store or it
      // will not start. Keys moved to schema.history.internal.* in 2.x (they
      // were database.history.* in 1.x). kafka:29092 is the in-network
      // (advertised INTERNAL) listener used by this repo's compose.yaml;
      // kafka:9092 is host-only.
      const historyTopic = `schemahistory.${TOPIC_PREFIX}`;
      if (v2) {
        base["schema.history.internal.kafka.bootstrap.servers"] = "kafka:29092";
        base["schema.history.internal.kafka.topic"] = historyTopic;
      } else {
        base["database.history.kafka.bootstrap.servers"] = "kafka:29092";
        base["database.history.kafka.topic"] = historyTopic;
      }
    } else if (src === "oracle") {
      Object.assign(base, conn, {
        "connector.class": "io.debezium.connector.oracle.OracleConnector",
        "database.dbname": val(dbname, defaults.dbname),
        "database.pdb.name": "ORCLPDB1",
        "log.mining.strategy": "online_catalog",
      });
    }

    return base;
  };

  const renderAll = () => {
    const cfg = buildConfig();
    const name = val(cname, "inventory-connector");
    const endpoint = val(curl, "http://localhost:8083").replace(/\/$/, "");
    const payload = { name, config: cfg };

    configEl.textContent = JSON.stringify(payload, null, 2);

    curlEl.textContent = [
      `curl -s -X POST ${endpoint}/connectors \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '${JSON.stringify(payload).replace(/'/g, `'\\''`)}' | jq .`,
    ].join("\n");
  };

  const flash = (button, message) => {
    if (!button) return;
    const label = button.textContent;
    button.textContent = message;
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  };

  const copy = (text, button) => {
    if (!navigator.clipboard) {
      flash(button, "unsupported");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => flash(button, "copied!"))
      .catch(() => flash(button, "error"));
  };

  $$(".tabs button[data-src]").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tabs button[data-src]").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      src = button.dataset.src || "postgres";
      renderAll();
    });
  });

  ["input", "change"].forEach((eventName) => {
    [
      cname,
      curl,
      dbname,
      user,
      pass,
      dlq,
      include,
      exclude,
      snapshot,
      fetchSize,
      taskMax,
      heartbeat,
      debz,
    ]
      .filter(Boolean)
      .forEach((element) => element.addEventListener(eventName, renderAll));
  });

  $("#copyConfig")?.addEventListener("click", (event) =>
    copy(configEl.textContent, event.currentTarget),
  );
  $("#copyCurl")?.addEventListener("click", (event) =>
    copy(curlEl.textContent, event.currentTarget),
  );

  renderAll();
});
