module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "backfill-resnapshot",
  heroConfig: {
    title: "Backfill and Re-Snapshot Safely",
    description:
      "<p>Reloading history into a sink produces events that must never overwrite newer streamed changes. Choose a re-snapshot, an incremental snapshot, a blocking snapshot, a Kafka replay or a SQL reload, then make the sink safe for all of them.</p>",
    align: "center",
    skillLevel: "Advanced",
    actions: [
      {
        href: "#rule",
        label: "The correctness rule",
        variant: "primary",
      },
      { href: "#runbook", label: "The runbook", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "backfill-resnapshot-quiz",
    title: "Backfill Knowledge Check",
    description:
      "Test whether you can tell a safe backfill from one that overwrites live data.",
    questions: [
      {
        question:
          "A backfill row for key 7 (log position 150) reaches the sink after a streamed update for key 7 (position 200) was applied. What should the sink do?",
        options: [
          "Apply it, because a snapshot is the source of truth",
          "Skip it, because its position is lower than the stored one",
          "Apply it only if its timestamp is newer",
          "Stop the pipeline and ask an operator",
        ],
        correct: "2",
        explanation:
          "The backfill row describes the table as of position 150. The stream has already applied a change at position 200, so the stored row is newer. A sink that applies a change only when its position is higher than the stored position skips the backfill row, and the result is the same whichever of the two arrived first.",
      },
      {
        question:
          "A Postgres slot was invalidated and the team re-snapshotted into an idempotent, position-guarded sink. Why can rows that were deleted at the source still be live in the sink afterwards?",
        options: [
          "Snapshots always skip deleted tables",
          "The position guard rejects delete events",
          "A snapshot only emits rows that exist now, so it never carries the deletes that happened during the gap",
          "Kafka tombstones are replayed first and undo the snapshot",
        ],
        correct: "3",
        explanation:
          "A snapshot reads the rows that exist when it runs. A row deleted at the source while the sink was missing events is simply not in the snapshot, and its delete event was lost with the log. The old row stays live in the sink until a sweep compares the sink's keys with the source's keys, and marks the extras as deleted with a position.",
      },
      {
        question:
          "Which Debezium ad hoc snapshot type temporarily stops streaming while it runs?",
        options: [
          "Blocking",
          "Incremental",
          "Both, in the same way",
          "Neither: streaming never pauses during a snapshot signal",
        ],
        correct: "1",
        explanation:
          "A blocking snapshot behaves like an initial snapshot that you trigger at run time: streaming stops, the snapshot runs, streaming resumes. An incremental snapshot reads the table in chunks while streaming continues, and uses watermarks to resolve collisions between chunk rows and streamed changes. Either way the topic can contain duplicates, so the sink still needs the guard.",
      },
      {
        question:
          "You plan to rebuild a sink by resetting its consumer group to the earliest offset of a topic. What must you check first?",
        options: [
          "That the topic was written with a transactional producer",
          "That the group's consumers are inactive, and that the topic still holds the history you need",
          "That the sink table has no primary key",
          "That Debezium is running in snapshot.mode=always",
        ],
        correct: "2",
        explanation:
          "Kafka's tooling resets offsets only for a group whose consumers are inactive, and it moves to the earliest offset that still exists. If retention has already discarded old segments, or compaction has removed old versions, the earliest offset is not the beginning of history. The replay then produces duplicates and old events, which only a guarded idempotent sink handles correctly.",
      },
    ],
  },
};
