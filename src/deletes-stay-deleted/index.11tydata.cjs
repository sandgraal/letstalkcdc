module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "deletes-stay-deleted",
  heroConfig: {
    title: "Deletes That Stay Deleted",
    description:
      "<p>A DELETE event reaching the warehouse is not the same as the data being gone. Trace one deleted row through the topic, the sink, its history and the backups, and learn which setting governs each copy.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#three-deletes",
        label: "Three kinds of delete",
        variant: "primary",
      },
      { href: "#monday", label: "What to do Monday", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "deletes-quiz",
    title: "Deletes Knowledge Check",
    description:
      "Test your understanding of delete markers, tombstones and where deleted data can still live.",
    questions: [
      {
        question:
          "A sink physically deletes the row when the delete event arrives. A replayed update with an older log position then arrives. What happens?",
        options: [
          "The update is skipped because the key was deleted",
          "The update finds no row and inserts it again, so the deleted row comes back",
          "The sink raises a duplicate-key error",
          "The Kafka tombstone blocks it",
        ],
        correct: "2",
        explanation:
          "A physical delete removes the stored position along with the row. The older update matches nothing, takes the insert path, and re-creates the row with the old values. Keeping a delete marker that carries the delete's position lets the guard compare positions and skip the older update.",
      },
      {
        question:
          "What does a Kafka tombstone (a record with a key and a null value) carry that a sink could use to order it against other changes for the same key?",
        options: [
          "The source log position",
          "The before image of the row",
          "Nothing: it has a key and no value, so there is no position to compare",
          "The Kafka offset of the delete event",
        ],
        correct: "3",
        explanation:
          "A tombstone is a marker for Kafka's log compaction. Its value is null, so it has no source position, no operation code and no before image. The delete event that precedes it is the record that carries those. A Kafka offset is a position in the Kafka log, not the source log, and it changes when a connector re-emits events.",
      },
      {
        question:
          "A Delta table has default retention settings. You run DELETE for one person's rows. When do the bytes leave storage?",
        options: [
          "Immediately, because DELETE rewrites the files",
          "After 30 days, when the log retention expires",
          "When the next checkpoint is written",
          "Only when VACUUM runs, and only for files older than the deleted-file retention (7 days by default)",
        ],
        correct: "4",
        explanation:
          "Delta's DELETE removes the data from the latest version but not from physical storage. Data files are deleted only when VACUUM runs, and VACUUM only removes files that have been unreferenced for longer than delta.deletedFileRetentionDuration (7 days by default). Time travel to older versions keeps working until then.",
      },
      {
        question:
          "When is it safe to physically remove a delete marker from the sink?",
        options: [
          "After every consumer of the table has seen the delete, and nothing that can still be replayed (topic, dead-letter queue, archive, staging) holds an event for that key older than the marker",
          "After 24 hours, which is Kafka's default delete.retention.ms",
          "As soon as the row has been marked deleted",
          "Never; markers must be kept forever",
        ],
        correct: "1",
        explanation:
          "A marker exists to stop older events from re-creating the row. It can go once the delete has propagated to everything downstream and the oldest event that any replay source can still deliver is newer than the marker. Kafka's delete.retention.ms is about the topic, not your sink.",
      },
    ],
  },
};
