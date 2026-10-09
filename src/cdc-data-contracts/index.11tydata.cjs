module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "cdc-data-contracts",
  heroConfig: {
    title: "Data Contracts for Database Events",
    description:
      "<p>When the producer is a database, the schema is a side effect of table DDL. Learn what a consumer may rely on in a change event, which ALTER TABLE statements break it, and how to catch the break before it ships.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#ddl-map",
        label: "Which DDL breaks what",
        variant: "primary",
      },
      { href: "#gate", label: "A DDL gate you can run", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "cdc-data-contracts-quiz",
    title: "Data Contracts: Knowledge Check",
    description:
      "Test whether you can say what a consumer may rely on and what a DDL change does to it.",
    questions: [
      {
        question:
          "A migration runs ALTER TABLE customers RENAME COLUMN email TO email_address. What does a consumer of the change events see?",
        options: [
          "A rename event that names the old and the new column",
          "Nothing, until the connector is restarted",
          "Events without email and with email_address; nothing says they are the same column",
          "The registry rejects every rename, so nothing reaches the topic",
        ],
        correct: "3",
        explanation:
          "The fields of an event come from the table's columns, and the Debezium pages describe no rename marker in the envelope. To a consumer a rename is one field gone and another present. Whether the registry accepts it depends on the compatibility mode and on defaults: a nullable column renamed passes every mode, so the break is silent.",
      },
      {
        question:
          "With Confluent Schema Registry at its default compatibility setting, what is a new schema version checked against?",
        options: [
          "Every earlier version of the subject",
          "Only the latest registered version, because the default BACKWARD is not transitive",
          "Nothing; the default is NONE",
          "Only the first version, which acts as the baseline",
        ],
        correct: "2",
        explanation:
          "The default is BACKWARD, and the documentation says it is not BACKWARD_TRANSITIVE, so a new schema is compared only with the latest one. A chain of individually compatible changes can still end somewhere an old record cannot be read, which matters when consumers rewind to the start of a topic.",
      },
      {
        question:
          "Which column change does Confluent's Avro compatibility table accept under BACKWARD but reject under FORWARD?",
        options: [
          "Adding a column with a default",
          "Dropping a nullable column",
          "Adding a NOT NULL column with no default",
          "Widening a column from int to bigint",
        ],
        correct: "4",
        explanation:
          "Widening a scalar type is backward compatible only: a reader on the new, wider type can read old data, but a reader still on the old type cannot read the new data. Adding or removing an optional field is accepted in all three modes, and adding a required field is accepted under FORWARD only.",
      },
      {
        question:
          "The registry rejects a schema the Debezium connector tries to register, and the connector's converter throws. What happens by default?",
        options: [
          "The task fails; Kafka Connect has no dead letter queue for source connectors",
          "The event is skipped and the connector carries on",
          "The event goes to a dead letter queue for replay",
          "The registry accepts it on the second attempt",
        ],
        correct: "1",
        explanation:
          "Kafka Connect fails the task on a conversion error unless errors.tolerance is changed, and the Confluent error-handling article says there is no dead letter queue for source connectors. A stopped connector is not reading the log, so on PostgreSQL the replication slot stops advancing and the WAL it holds keeps growing.",
      },
      {
        question:
          "A schema change is fully compatible. Why must the sink still be idempotent and ordered by source log position?",
        options: [
          "Because compatibility modes are only advisory",
          "Because a compatible schema makes the registry resend each event",
          "Compatibility covers an event's shape, not delivery: a change can still arrive twice or late",
          "It does not; full compatibility removes duplicates",
        ],
        correct: "3",
        explanation:
          "A contract describes structure and meaning. Delivery stays at-least-once, so a duplicate or a replayed older change is possible whatever the schema says. Position-guarded upserts are what make that harmless; no registry setting makes a hop exactly-once.",
      },
    ],
  },
};
