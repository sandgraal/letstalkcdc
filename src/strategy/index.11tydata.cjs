module.exports = {
  seriesKey: "strategy",
  heroConfig: {
    title: "The Strategic Advantage of CDC",
    description:
      "<p>Shift from slow, state-based data thinking to an event-driven culture. Learn how continuous change streams unlock new revenue, retire tech debt, and reduce operational risk.</p>",
    align: "center",
    skillLevel: "Beginner",
    actions: [
      { href: "#business-case", label: "See the ROI" },
      {
        href: "#mindset-shift",
        label: "Explore the Mindset Shift",
        variant: "ghost",
      },
    ],
  },
  quizConfig: {
    id: "strategy-quiz",
    title: "CDC Strategy Knowledge Check",
    description:
      "Test your understanding of CDC's strategic value and organizational impact.",
    questions: [
      {
        question:
          "What is a key business benefit of adopting CDC over traditional batch ETL?",
        options: [
          "CDC is always cheaper than batch processing",
          "CDC enables real-time decision-making and faster time-to-insight by reducing data latency from hours to seconds",
          "CDC eliminates the need for databases",
          "Batch ETL is always superior to CDC",
        ],
        correct: "2",
        explanation:
          "CDC's primary business value is reducing data latency dramatically. Instead of waiting hours for nightly ETL jobs, business users get near real-time data for dashboards, alerts, and decision-making. This agility enables competitive advantages: faster responses to market changes, proactive customer engagement, and operational efficiency.",
      },
      {
        question: "How does CDC contribute to reducing technical debt?",
        options: [
          "CDC increases technical debt by adding complexity",
          "CDC replaces brittle point-to-point integrations and batch jobs with a scalable, event-driven architecture",
          "Technical debt is unrelated to data pipelines",
          "CDC only works with legacy systems",
        ],
        correct: "2",
        explanation:
          "Many organizations have accumulated technical debt through fragmented batch jobs, custom scripts, and point-to-point database integrations. CDC provides a unified, standardized approach to data movement, replacing these ad-hoc solutions with a maintainable, event-driven architecture that scales and evolves more easily.",
      },
      {
        question:
          "What mindset shift does CDC adoption require from data teams?",
        options: [
          "From event-driven thinking to batch-oriented thinking",
          "From thinking about snapshots/state to thinking about continuous streams of changes",
          "CDC doesn't require any mindset changes",
          "From real-time to delayed processing",
        ],
        correct: "2",
        explanation:
          "CDC requires a shift from 'batch snapshot' thinking (full table dumps at intervals) to 'continuous event stream' thinking (incremental changes as they happen). This affects data modeling, testing, monitoring, and operational practices. Teams must design for eventual consistency, idempotency, and handling out-of-order events.",
      },
      {
        question: "How does CDC reduce operational risk in data pipelines?",
        options: [
          "CDC eliminates all risks in data systems",
          "CDC provides incremental changes, reducing database load, and enables faster recovery with replays and audit trails",
          "CDC increases operational risk",
          "Operational risk is not affected by data architecture",
        ],
        correct: "2",
        explanation:
          "CDC reduces risk by: (1) lowering source database load (no full table scans), (2) enabling point-in-time recovery through event replay, (3) providing comprehensive audit trails, and (4) allowing canary deployments and rollbacks. The incremental nature and event log retention make failures less catastrophic and recovery faster.",
      },
      {
        question:
          "What is a common challenge when building a business case for CDC?",
        options: [
          "CDC is always an easy sell with obvious ROI",
          "Quantifying the value of reduced latency and improved data freshness can be difficult without clear business metrics",
          "CDC has no business value",
          "Business cases are not needed for technical decisions",
        ],
        correct: "2",
        explanation:
          "While CDC's technical benefits are clear, justifying the investment requires tying reduced latency to business outcomes: revenue from real-time recommendations, cost savings from operational efficiency, or risk reduction from faster incident detection. Without clear metrics, CDC may seem like an expensive 'nice-to-have' rather than a strategic imperative.",
      },
    ],
  },
};
