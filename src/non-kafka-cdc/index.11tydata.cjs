module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "non-kafka-cdc",
  heroConfig: {
    title: "CDC Without Kafka: Server, Engine, Search Sync",
    description:
      "<p>Take Kafka away and the delivery guarantee does not improve: it is still at-least-once, and the sink still decides which row wins. See what Debezium Server, the embedded engine and managed services state, then sync a search index or cache with the log position as the version.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#decide",
        label: "Which path for which need",
        variant: "primary",
      },
      { href: "#search", label: "Search index sync", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "non-kafka-cdc-quiz",
    title: "CDC Without Kafka: Knowledge Check",
    description:
      "Test whether you can say what a non-Kafka path guarantees and what the sink must still do.",
    questions: [
      {
        question:
          "Debezium Server crashes after its sink delivered a batch but before the offsets were flushed. What does the destination see after the restart?",
        options: [
          "Nothing, the sink acknowledged the batch so it is never re-sent",
          "Some of the same changes again, because the connector resumes from the last stored offset",
          "A transaction rollback on the destination",
          "A gap, because the unflushed changes are skipped",
        ],
        correct: "2",
        explanation:
          "Offsets are stored on their own schedule (a file by default, or Redis, JDBC or Kafka), not inside the destination's write. The connector resumes from the last stored offset, so changes delivered after it arrive again. Nothing is skipped, which is why the destination must tolerate duplicates.",
      },
      {
        question:
          "In the Debezium embedded engine, when should a ChangeConsumer call RecordCommitter.markProcessed for a record?",
        options: [
          "Before writing it, so the offset moves forward quickly",
          "Only after the record's effect is durable in your destination",
          "Never, the engine does it automatically",
          "Only for the last record of a batch",
        ],
        correct: "2",
        explanation:
          "markProcessed records the source offset that will be flushed. Calling it before the write is durable lets a crash lose the change, because the stored offset has already moved past it. Calling it after is the at-least-once contract: a crash in between repeats the record, and an idempotent write absorbs the repeat.",
      },
      {
        question:
          "You index CDC events into Elasticsearch with version_type=external and the source log position as the version. A change with an equal version arrives a second time. What happens?",
        options: [
          "It overwrites the document again, harmlessly",
          "It is rejected with a 409 version conflict, which your consumer should treat as already applied",
          "It is queued until the stored version is lower",
          "Elasticsearch silently ignores it and returns 200",
        ],
        correct: "2",
        explanation:
          "The external version type indexes only if the supplied version is strictly higher than the stored one. An equal version gets a 409, so a duplicate or a stale replay is refused. The consumer must treat that 409 as success, not as a failure to retry.",
      },
      {
        question:
          "A document was deleted in Elasticsearch with external version 300. Ninety seconds later a replayed update with version 200 arrives. With the default settings, what is the most likely result?",
        options: [
          "It is refused, because the delete is remembered forever",
          "It is accepted and the document comes back, because index.gc_deletes (60s by default) has expired",
          "Elasticsearch deletes the update",
          "The cluster turns red",
        ],
        correct: "2",
        explanation:
          "A deleted document's version stays available for index.gc_deletes, 60 seconds by default. After that nothing is left to compare against, so an older update is a new document. On Elasticsearch 9.5.5 the page's probe saw the old update refused until about 56 seconds and accepted at 61 seconds. Raise the setting past your replay horizon or keep a delete-marker document.",
      },
      {
        question:
          "Which is the safest thing to say about a managed CDC service that writes into your warehouse?",
        options: [
          "It delivers exactly-once because the vendor says so",
          "Read what its documentation states about delivery and ordering, and keep the destination write idempotent on the log position it exposes",
          "Ordering is always guaranteed by arrival time",
          "Duplicates cannot happen because there is no Kafka",
        ],
        correct: "2",
        explanation:
          "Datastream documents at-least-once delivery and no ordering guarantee, and says duplicates can be detected with an event UUID. The other services' pages read for this lesson state less. Whatever the service says, the destination write stays an upsert ordered by the source position it gives you.",
      },
    ],
  },
};
