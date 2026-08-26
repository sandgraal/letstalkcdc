/**
 * Data for the /compare/ vendor hub — a head-to-head of the six CDC
 * platforms readers actually evaluate against each other. Kept separate
 * from `cdcVendors.mjs` (the 15-entry catalog on /intro/) because this
 * carries richer, comparison-specific fields.
 *
 * Honesty rules baked into the content (they are the whole point of the
 * page): every platform's wire delivery is **at-least-once** — none give
 * end-to-end exactly-once across systems. Correctness comes from
 * **idempotent sinks** (upsert on the primary key, ordered by the source
 * log position). Where a vendor markets "exactly-once", the `delivery`
 * field states the honest version. No fabricated pricing or benchmarks:
 * `cost` and `latency` are qualitative, order-of-magnitude only.
 *
 * `dimensions` drives the matrix rows (in order); `platforms` drives the
 * columns and the per-platform cards + decision guide.
 */

export const dimensions = [
  { key: "deployment", label: "Deployment" },
  { key: "license", label: "License / model" },
  { key: "method", label: "CDC method" },
  { key: "delivery", label: "Delivery semantics" },
  { key: "latency", label: "Typical latency" },
  { key: "targets", label: "Targets / sinks" },
  { key: "schema", label: "Schema evolution" },
  { key: "ops", label: "Ops burden" },
  { key: "cost", label: "Cost model" },
];

export const platforms = [
  {
    name: "Debezium + Kafka Connect",
    slug: "debezium",
    deployment: "Self-hosted (or managed Kafka/Connect)",
    license: "Open source (Apache-2.0)",
    method: "Log-based (WAL / binlog / redo)",
    delivery:
      "At-least-once; dedupe on a PK-keyed sink (Kafka log compaction + idempotent consumer)",
    latency: "Sub-second",
    targets: "Anything downstream of Kafka",
    schema: "Schema Registry + compatibility modes; DDL surfaced as events",
    ops: "High — you run Kafka, Connect, and monitoring",
    cost: "No license; infra + engineering time",
    bestFor:
      "Event-driven systems and streaming pipelines that want full control.",
    strengths: [
      "Maximum control and portability — no vendor lock-in",
      "Sub-second, true log-based capture with a large connector ecosystem",
      "Composes with the whole Kafka ecosystem (SMTs, streams, sinks)",
    ],
    tradeoffs: [
      "You own the operational burden: Kafka/Connect, upgrades, monitoring",
      "Steeper learning curve; more moving parts to get right",
    ],
  },
  {
    name: "AWS DMS",
    slug: "aws-dms",
    deployment: "AWS managed service (or DMS Serverless)",
    license: "Usage-based (AWS)",
    method: "Log-based (full-load + CDC)",
    delivery:
      "At-least-once; restarts can re-emit — upsert on PK ordered by log position at the sink",
    latency: "Seconds",
    targets: "AWS targets: S3, Redshift, Kinesis, RDS, others",
    schema: "Limited transforms; some DDL handled, verify per engine",
    ops: "Low–medium — managed, but tasks and monitoring are yours",
    cost: "Per replication-instance hour + transfer",
    bestFor:
      "AWS-native stacks moving RDS/Aurora changes into AWS analytics targets.",
    strengths: [
      "Fully managed, IaC-friendly (Terraform), tight AWS integration",
      "Handles snapshot + CDC in one task with the log-position handoff",
    ],
    tradeoffs: [
      "AWS targets only; less useful outside the AWS estate",
      "Transformation is limited compared with a streaming platform",
    ],
  },
  {
    name: "Fivetran",
    slug: "fivetran",
    deployment: "SaaS (zero infrastructure)",
    license: "Usage-based (Monthly Active Rows)",
    method: "Log-based connectors",
    delivery:
      "At-least-once into a landing table; the destination MERGE dedupes on PK",
    latency: "~1–5 min (plan-dependent)",
    targets: "Cloud warehouses: Snowflake, BigQuery, Redshift, Databricks",
    schema: "Automatic schema-drift handling into the destination",
    ops: "Near-zero — fully hands-off",
    cost: "MAR-based; grows with changed rows",
    bestFor: "Teams that want warehouse ELT with the least operational effort.",
    strengths: [
      "Fastest setup; genuinely hands-off operations",
      "Automatic schema drift + a very broad connector library",
    ],
    tradeoffs: [
      "MAR pricing can climb with high-churn tables",
      "Warehouse-centric; not a general event bus",
    ],
  },
  {
    name: "Airbyte",
    slug: "airbyte",
    deployment: "Self-hosted (OSS) or Airbyte Cloud",
    license: "Open source (ELv2) + managed cloud",
    method: "Log-based CDC (Debezium-embedded) + connectors",
    delivery: "At-least-once; the sync writes to a landing table deduped on PK",
    latency: "Minutes (scheduled syncs)",
    targets: "Warehouses, lakes, and many destinations",
    schema: "Schema propagation with configurable change handling",
    ops: "Medium self-hosted; low on Cloud",
    cost: "Free OSS (self-run) or credit-based Cloud",
    bestFor:
      "Broad-coverage ELT where connector breadth matters more than sub-second latency.",
    strengths: [
      "Huge connector catalog; open-source option you can self-host",
      "Log-based CDC for the major databases via embedded Debezium",
    ],
    tradeoffs: [
      "Batch/scheduled cadence — minutes, not sub-second",
      "Self-hosting still carries real operational work",
    ],
  },
  {
    name: "Oracle GoldenGate",
    slug: "goldengate",
    deployment: "Self-hosted or OCI GoldenGate",
    license: "Commercial (five-figures-per-processor list)",
    method: "Log-based (Extract → trail files → Replicat)",
    delivery:
      "At-least-once delivery with checkpoint-based, effectively-once apply — not end-to-end exactly-once",
    latency: "Sub-minute",
    targets: "Heterogeneous DBs (Oracle, MySQL, PostgreSQL, SQL Server, …)",
    schema: "DDL replication + transformation/mapping",
    ops: "High — DBA expertise, dedicated infrastructure",
    cost: "Commercial licensing (verify current Oracle price list)",
    bestFor:
      "Enterprise Oracle shops needing heterogeneous or active-active replication.",
    strengths: [
      "Battle-tested for mission-critical, low-downtime replication",
      "Bidirectional/active-active with conflict detection; heterogeneous",
    ],
    tradeoffs: [
      "Expensive licensing and steep learning curve",
      "Vendor marketing overstates delivery — it is at-least-once at the wire",
    ],
  },
  {
    name: "Qlik Replicate (Attunity)",
    slug: "qlik-replicate",
    deployment: "Self-hosted (agent/server)",
    license: "Commercial",
    method: "Log-based",
    delivery: "At-least-once; sinks apply idempotently (upsert on PK)",
    latency: "Seconds",
    targets: "Broad source/target matrix incl. mainframe and warehouses",
    schema: "DDL handling + transformation in a GUI",
    ops: "Medium — GUI-driven, less hand-coding",
    cost: "Commercial licensing",
    bestFor:
      "Enterprises wanting broad connectivity with a low-code, GUI-first workflow.",
    strengths: [
      "GUI-first, low-code; broad source/target coverage incl. legacy",
      "Fast to stand up relative to hand-built pipelines",
    ],
    tradeoffs: [
      "Commercial licensing; less flexible than a code-first platform",
      "Not an event-streaming bus — replication-oriented",
    ],
  },
];

export default { dimensions, platforms };
