module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  seriesKey: "test-your-pipeline",
  heroConfig: {
    title: "Testing a CDC Pipeline",
    description:
      "<p>Prove that your pipeline converges when events arrive twice, late or after a crash: runnable tests for the envelope, the sink and the replay, plus what not to test for.</p>",
    align: "center",
    skillLevel: "Intermediate",
    actions: [
      {
        href: "#duplicates",
        label: "Run the duplicate test",
        variant: "primary",
      },
      { href: "#property", label: "Property-based sketch", variant: "ghost" },
    ],
  },
  quizConfig: {
    id: "test-your-pipeline-quiz",
    title: "Testing a CDC Pipeline Knowledge Check",
    description:
      "Test your understanding of what a CDC test plan should and should not assert.",
    questions: [
      {
        question: "What should a duplicate-delivery test assert?",
        options: [
          "That the topic never contains the same event twice",
          "That applying the same batch a second time leaves the target table unchanged",
          "That the connector's offset never moves backwards",
          "That every event reaches the sink exactly once",
        ],
        correct: "2",
        explanation:
          "CDC delivery is at-least-once, so duplicates are expected after a failure. The contract to test is convergence: replaying the same changes must leave the same state. Asserting that no duplicate ever appears would fail on correct behaviour.",
      },
      {
        question:
          "A sink keeps the row with the newest ts_ms per key. Which feature of the test fixture most reliably exposes that bug?",
        options: [
          "Two changes to one key in the same millisecond, delivered in shuffled order",
          "A table with many columns",
          "A very large batch",
          "A connector restart",
        ],
        correct: "1",
        explanation:
          "Millisecond timestamps tie. When two changes to a key share a millisecond, the timestamp cannot say which is later, so arrival order decides. Only a shuffled delivery of a fixture with such a tie shows it; duplicate and resurrection tests can pass a timestamp-ordered sink.",
      },
      {
        question:
          "In the resurrection test, why is the delete delivered before an older update for the same key?",
        options: [
          "Deletes are always processed first by Kafka",
          "To check that the sink removes the row quickly",
          "To check that a delete kept as a marker with its log position stops an older change from bringing the row back",
          "To make the batch smaller",
        ],
        correct: "3",
        explanation:
          "If the sink physically removes the row on delete, there is nothing left to compare the late update against and it inserts the row again. A delete marker that carries its log position makes the older update fail the position guard.",
      },
      {
        question:
          "You kill the Connect worker with SIGKILL, restart it, and the sink checks pass. What must you also confirm before trusting the result?",
        options: [
          "That the sink table has more rows than before",
          "That the connector name did not change",
          "That the kill happened after a graceful flush of offsets",
          "That the topic actually contained duplicated events, otherwise the sink never saw any",
        ],
        correct: "4",
        explanation:
          "Duplicates appear only if events were produced after the last offset flush and before the crash. If the kill missed that window the topic has no duplicates and a pass proves nothing, so the script should fail the run when it counts none.",
      },
      {
        question:
          "Source and sink row counts match and the position check is clean, yet users see wrong data. Which check can find it?",
        options: [
          "A longer retention period on the topic",
          "A checksum per key range, compared between source and sink",
          "Restarting the connector",
          "Counting delete markers",
        ],
        correct: "2",
        explanation:
          "Counts cannot see content differences, and a position check compares the sink with the event log rather than with the source, so a change that never reached the log is invisible to it. A per-range checksum compares actual content on both sides.",
      },
    ],
  },
};
