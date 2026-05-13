module.exports = {
  datePublished: "2026-02-06",
  dateModified: "2026-05-13",
  seriesKey: "intro",
  breadcrumbs: [
    { label: "Home", url: "/" },
    { label: "The Series", url: "/overview/" },
    { label: "Interactive Introduction to CDC" },
  ],
  heroConfig: {
    title: "Interactive Introduction to CDC",
    description: `Start here if you're moving from batch ETL to real-time pipelines. You'll get the foundations, architectural trade-offs, and tooling map you need before diving into the advanced playbooks.`,
    align: "center",
    skillLevel: "Beginner",
    actions: [
      { href: "#cdc-methods", label: "Jump to Methods", variant: "secondary" },
      { href: "#methods-table", label: "Compare Approaches", variant: "ghost" },
      {
        href: "#series-roadmap",
        label: "View Learning Path",
        variant: "secondary",
      },
    ],
  },
  quizConfig: {
    id: "intro-quiz",
    title: "Test Your Understanding",
    description:
      "Check your knowledge of CDC fundamentals with these questions.",
    questions: [
      {
        question:
          "What is the primary advantage of Change Data Capture (CDC) over traditional batch ETL?",
        options: [
          "CDC is always faster than batch processing",
          "CDC captures and streams only the changed data in near real-time",
          "CDC doesn't require any database setup",
          "CDC works only with NoSQL databases",
        ],
        correct: "2",
        explanation:
          "CDC captures only the changed data and streams it in near real-time, avoiding expensive full table scans and providing much lower latency compared to nightly batch ETL. This makes it ideal for real-time analytics and event-driven architectures.",
      },
      {
        question:
          "Which CDC method directly reads the database's transaction log (WAL)?",
        options: [
          "Query-based CDC",
          "Trigger-based CDC",
          "Log-based CDC",
          "Transactional Outbox",
        ],
        correct: "3",
        explanation:
          "Log-based CDC reads directly from the database's write-ahead log (WAL) or transaction log. This approach has minimal impact on the source database and captures all changes without modifying application code or database schema.",
      },
      {
        question: "What is the Transactional Outbox pattern?",
        options: [
          "A method to compress database logs",
          "An application-level pattern where changes are written to an outbox table in the same transaction",
          "A type of CDC connector for PostgreSQL",
          "A backup strategy for databases",
        ],
        correct: "2",
        explanation:
          "The Transactional Outbox pattern is an application-level approach where changes are written to a special outbox table within the same transaction as the business data. A separate process then reads and publishes these events. This ensures atomicity between the business operation and event publication.",
      },
      {
        question:
          "Which component in a CDC pipeline is responsible for converting database-specific log formats into a standard event format?",
        options: [
          "The message broker (e.g., Kafka)",
          "The sink connector",
          "The source connector or capture agent",
          "The schema registry",
        ],
        correct: "3",
        explanation:
          "The source connector or capture agent reads the database logs and transforms them into standardized events (often with a schema like before/after images). Tools like Debezium serve this role, producing consistent event structures regardless of the source database type.",
      },
      {
        question:
          "What is a common challenge when implementing CDC that relates to the initial state of data?",
        options: [
          "Databases don't support transaction logs",
          "Performing a consistent snapshot before streaming changes",
          "CDC only works with new data",
          "All existing data must be deleted first",
        ],
        correct: "2",
        explanation:
          "One of the key challenges in CDC is performing an initial consistent snapshot of existing data before streaming live changes. This snapshot must be coordinated with the log position to avoid gaps or duplicates, a process known as the 'snapshot-to-stream handoff.'",
      },
    ],
  },
};
