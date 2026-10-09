module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "is-cdc-exactly-once",
  heroConfig: {
    title: "Is CDC Exactly-Once? Check Each Hop",
    description:
      "<p>Debezium says at-least-once, a vendor says exactly-once. Both can be true of different hops. Scope the claim, know what the opt-in Kafka Connect mode really covers, and verify what your pipeline gives.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#claims",
        label: "Check a claim",
        variant: "primary",
      },
      { href: "#decide", label: "Decision flow", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "is-cdc-exactly-once-quiz",
    title: "Exactly-Once, Hop by Hop: Knowledge Check",
    description:
      "Test whether you can scope an exactly-once claim and name what each hop needs.",
    questions: [
      {
        question:
          "A vendor page says its CDC service delivers 'with exactly-once semantics'. What is the first thing to ask?",
        options: [
          "How many connectors it supports",
          "Which hop the guarantee covers, and what removes duplicates at the sink",
          "Whether it is written in Java",
          "Whether the claim also appears in the pricing table",
        ],
        correct: "2",
        explanation:
          "A CDC pipeline has several hops (database to connector, connector to topic, topic to sink, sink to its own store) and a guarantee on one hop says nothing about the next. The claim is only useful once it names the hop and the mechanism, and for the last hop that mechanism is usually an idempotent write.",
      },
      {
        question:
          "What does Debezium's exactly-once delivery page document, as of Debezium 3.7?",
        options: [
          "Exactly-once delivery is on by default for every connector",
          "An opt-in Kafka Connect mode for the connector-to-topic hop, with the page's own known-issues caveats",
          "A deduplication layer inside Debezium that protects your sink",
          "Exactly-once delivery from the source database to a warehouse",
        ],
        correct: "2",
        explanation:
          "The page opens by saying Debezium provides at-least-once delivery and has no internal deduplication layer. It then documents that Kafka Connect's exactly-once support for source connectors (KIP-618) can be switched on for the hop into Kafka, and it warns that it is unclear whether the implementation is fully correct.",
      },
      {
        question:
          "Which consumer setting makes a downstream consumer ignore records from aborted Kafka transactions?",
        options: [
          "enable.idempotence=true",
          "transactional.id=cdc",
          "isolation.level=read_committed",
          "exactly.once.support=required",
        ],
        correct: "3",
        explanation:
          "The consumer default is isolation.level=read_uncommitted, which returns transactional messages even if the transaction aborted. read_committed returns only committed ones. The other settings are producer or connector settings and do not change what a consumer reads.",
      },
      {
        question:
          "A sink stores the Kafka offset in the same database transaction as each row. After a crash the source re-emits an already-delivered change as a new record at a later offset. With no position guard on the upsert, what happens?",
        options: [
          "The sink applies it again, because the offset is new and the offset table cannot recognise the change",
          "The sink skips it, because the offset table already contains that change",
          "Kafka rejects the record as a duplicate",
          "The sink transaction rolls back automatically",
        ],
        correct: "1",
        explanation:
          "Storing offsets with the data protects against the consumer replaying the same Kafka record. A duplicate produced upstream is a different record with a different offset, so only a guard on the source log position (the row is updated only if the incoming position is higher) turns it into a no-op.",
      },
      {
        question:
          "Which statement scopes Kafka Streams processing.guarantee=exactly_once_v2 correctly?",
        options: [
          "It makes a database written from inside a processor exactly-once",
          "It makes the whole pipeline from the source database to the warehouse exactly-once",
          "It removes the need for idempotent sinks",
          "It makes reads, writes and offset commits atomic for Kafka topics, not for an external system",
        ],
        correct: "4",
        explanation:
          "Kafka Streams commits input offsets, state-store updates and output-topic writes atomically inside Kafka. An external database or HTTP call that a processor touches is outside that transaction, so it needs its own idempotency.",
      },
    ],
  },
};
