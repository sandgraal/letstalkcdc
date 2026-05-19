/**
 * CDC platforms catalog rendered on `/intro/` ("CDC platforms"
 * section). Previously this list lived as 15 hard-coded
 * `<article class="cdc-card">` blocks inline in
 * `src/intro/index.njk` — moving the data here cuts ~135 lines
 * out of the template and centralizes the catalog so any future
 * /compare/ or /tooling/ rendering can read from the same source.
 *
 * Each entry:
 *   - name:    display string used in <h3>.
 *   - tags:    array of strings; rendered as `<span class="cdc-pill">`
 *              chips. Also flattened into the `data-tags=` attribute
 *              the client-side `pages/intro.js` filter reads.
 *   - blurb:   one-paragraph plain-text description. The intro
 *              template renders this without `| safe`, so any HTML
 *              would be escaped and shown literally — keep entries
 *              prose-only. (If a future use case needs inline
 *              emphasis, add `| safe` at the call site and document
 *              the trust expectations there.)
 *
 * Tag ordering inside an entry is preserved in the rendered output;
 * filter pills use the same order. Entry ordering in this file
 * decides display order on the page — keep "Debezium + Kafka
 * Connect" first (the open-source baseline most readers know).
 *
 * To add a vendor: append an entry here. To retire one: delete
 * the entry. No template changes needed in either case.
 */

export default [
  {
    name: "Debezium + Kafka Connect",
    tags: ["open source", "log-based", "DIY ops"],
    blurb:
      "Open-source log-based CDC connectors. Flexible; you operate " +
      "Kafka/Connect or use managed Kafka.",
  },
  {
    name: "Matillion (Data Loader / Designer)",
    tags: ["managed", "log-based", "ELT + orchestration"],
    blurb:
      "Wizard-driven CDC into cloud warehouses plus " +
      "orchestration/transform in one place.",
  },
  {
    name: "Fivetran",
    tags: ["managed", "log-based"],
    blurb:
      "Managed connectors with log-based CDC options; emphasizes quick " +
      "setup and hands-off operations.",
  },
  {
    name: "Precisely (Connect)",
    tags: ["enterprise", "log-based", "heterogeneous"],
    blurb:
      "Enterprise replication including mainframe/legacy into modern " +
      "targets.",
  },
  {
    name: "Qlik Replicate (Attunity)",
    tags: ["enterprise", "log-based"],
    blurb: "UI-driven enterprise CDC across a wide range of sources/targets.",
  },
  {
    name: "Oracle GoldenGate",
    tags: ["enterprise", "log-based"],
    blurb:
      "Oracle’s CDC/replication stack (supports several non-Oracle " +
      "endpoints) for mission-critical use.",
  },
  {
    name: "AWS DMS",
    tags: ["managed", "log-based"],
    blurb:
      "Managed migrations and ongoing CDC into AWS targets (and beyond " +
      "via connectors).",
  },
  {
    name: "Google Cloud Datastream",
    tags: ["serverless", "log-based"],
    blurb:
      "Serverless CDC for MySQL/Postgres/Oracle streaming into " +
      "BigQuery/Cloud Storage.",
  },
  {
    name: "Confluent Commercial Connectors",
    tags: ["commercial", "log-based"],
    blurb:
      "Kafka Connect ecosystem with additional commercial CDC connectors " +
      "like Oracle.",
  },
  {
    name: "StreamSets",
    tags: ["platform", "CDC connectors"],
    blurb: "Streaming pipelines with CDC connectors into warehouses/lakes.",
  },
  {
    name: "Striim",
    tags: ["platform", "CDC + transform"],
    blurb: "CDC + in-flight SQL-like processing for real-time ops analytics.",
  },
  {
    name: "IBM Data Replication",
    tags: ["enterprise", "log-based"],
    blurb: "Log-based CDC for Db2 and mixed mainframe/distributed estates.",
  },
  {
    name: "SAP SLT",
    tags: ["SAP", "trigger/log"],
    blurb:
      "Native trigger/log-based replication from SAP ECC/S/4HANA to " +
      "downstream stores.",
  },
  {
    name: "Hevo Data",
    tags: ["managed", "CDC"],
    blurb: "Managed ELT with CDC support into cloud targets.",
  },
  {
    name: "Airbyte",
    tags: ["open source", "mixed CDC"],
    blurb:
      "Open-source ELT; CDC varies by connector (check docs for log-based " +
      "maturity per source).",
  },
];
