module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "transactional-outbox",
  heroConfig: {
    title: "Transactional Outbox and Relay",
    description:
      "<p>The outbox makes the event and the state change commit together. It does not make the publish exactly-once. See why dual writes fail, what the relay and Debezium's router do on a restart, and what a consumer must keep to stay correct.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#table",
        label: "The outbox table",
        variant: "primary",
      },
      { href: "#monday", label: "What to do Monday", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "transactional-outbox-quiz",
    title: "Transactional Outbox Knowledge Check",
    description:
      "Test whether you can tell what the outbox guarantees from what the consumer still has to do.",
    questions: [
      {
        question:
          "A service commits its database transaction, then calls the Kafka producer, and crashes between the two. What does the outbox change?",
        options: [
          "Nothing, the crash still loses the event",
          "The event row was committed with the state change, so a relay publishes it after the restart",
          "Kafka now joins the database transaction",
          "The event is published exactly once",
        ],
        correct: "2",
        explanation:
          "The outbox moves the event into the same database transaction as the state change. If the transaction commits, the event row exists and a relay will publish it later; if it rolls back, neither exists. Kafka does not take part in the transaction, and the relay may still publish the row more than once.",
      },
      {
        question:
          "Outbox event ids are random UUIDs. A consumer must apply the events of one order in order. What should the events carry?",
        options: [
          "Nothing more, UUIDs sort by creation time",
          "The Kafka offset of the previous event",
          "The order id as the Kafka key, plus a per-order version written in the same transaction",
          "A wall-clock timestamp from the application server",
        ],
        correct: "3",
        explanation:
          "A random UUID identifies an event but gives no order. The order id as the key keeps one order's events in one partition, and a version incremented under the order row's lock in the same transaction says which change is newer. The consumer applies an event only if its version is higher than the last one applied. Offsets and timestamps are not a safe version.",
      },
      {
        question:
          "With a log-tailing relay, the application inserts the outbox row and deletes it in the same transaction. What reaches Kafka for the delete?",
        options: [
          "A delete event followed by a tombstone",
          "Nothing, the Debezium outbox router discards delete operations on the outbox table",
          "A duplicate of the insert event",
          "An error that stops the connector",
        ],
        correct: "2",
        explanation:
          "A log-based connector reads the transaction log, which holds the insert and the delete. The Debezium reference says the router automatically filters out DELETE operations on an outbox table, so only the insert becomes a message. Updates to outbox rows are different: the router warns, errors or stops depending on table.op.invalid.behavior.",
      },
      {
        question:
          "A consumer prunes its seen-event-id table of every id older than its committed Kafka offset. The connector is rewound and re-publishes old outbox events. What can happen?",
        options: [
          "Nothing, ids older than the offset can never come back",
          "The re-published events arrive at new, higher offsets with ids that were pruned, so they are applied again and can overwrite newer state",
          "Kafka rejects the duplicate ids",
          "The consumer stops with an offset error",
        ],
        correct: "2",
        explanation:
          "A connector replay is a new send, so the same event id arrives at a new offset. An offset-based prune therefore does not bound how old a duplicate can be. Keep the last applied version per aggregate (it needs no pruning) or keep ids for longer than the longest rewind you can perform.",
      },
    ],
  },
};
