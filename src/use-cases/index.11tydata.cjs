module.exports = {
  seriesKey: "use-cases",
  heroConfig: {
    title: "CDC in the Wild",
    description:
      "<p>Explore the real-world patterns powered by change streams—from real-time analytics to cache invalidation and microservice choreography.</p>",
    align: "center",
    skillLevel: "Beginner",
    actions: [
      { href: "#warehousing", label: "Analytics & BI" },
      {
        href: "#microservices",
        label: "Microservices Integration",
        variant: "ghost",
      },
    ],
  },
  quizConfig: {
    id: "use-cases-quiz",
    title: "CDC Use Cases Knowledge Check",
    description:
      "Test your understanding of real-world CDC applications and patterns.",
    questions: [
      {
        question:
          "How does CDC enable real-time analytics and business intelligence?",
        options: [
          "By replacing all batch processes with manual queries",
          "By streaming fresh data continuously to data warehouses, enabling near real-time dashboards and reports",
          "CDC is not suitable for analytics workloads",
          "By storing data only in memory",
        ],
        correct: "2",
        explanation:
          "CDC streams database changes to data warehouses or lakes as they happen, replacing slow nightly batch jobs. This enables real-time dashboards, up-to-the-minute reports, and timely business decisions. Analysts get fresh data without waiting hours for batch ETL to complete.",
      },
      {
        question: "What is cache invalidation via CDC?",
        options: [
          "Deleting all cached data every minute",
          "Using CDC events to selectively invalidate or update cache entries when source data changes",
          "Cache invalidation is not possible with CDC",
          "Disabling caching entirely",
        ],
        correct: "2",
        explanation:
          "CDC events signal when specific records change in the source database. Applications can listen to these events and selectively invalidate or update corresponding cache entries (Redis, Memcached, etc.), ensuring the cache stays consistent with the database without relying on TTLs or full cache flushes.",
      },
      {
        question: "How does CDC support microservice data synchronization?",
        options: [
          "By forcing all microservices to share one database",
          "By streaming change events from one service's database to other services, maintaining eventual consistency",
          "Microservices should never share data",
          "CDC only works with monolithic architectures",
        ],
        correct: "2",
        explanation:
          "In microservices architectures where each service owns its data, CDC enables cross-service data sharing without tight coupling. One service captures changes to its database and publishes them as events. Other services consume these events, building local read models or replicas—achieving eventual consistency without direct database access.",
      },
      {
        question: "What role does CDC play in event-driven architectures?",
        options: [
          "CDC is not related to event-driven systems",
          "CDC transforms database changes into events, enabling reactive systems that respond to state changes",
          "Event-driven architectures only use application-level events",
          "CDC prevents event-driven patterns",
        ],
        correct: "2",
        explanation:
          "CDC is a foundational pattern for event-driven architectures. It captures database changes—often the source of truth—and publishes them as events. Downstream systems react to these events, triggering workflows, notifications, or updates. This decouples producers from consumers and enables scalable, asynchronous processing.",
      },
      {
        question: "How can CDC help with disaster recovery and audit trails?",
        options: [
          "CDC has no role in disaster recovery",
          "CDC events provide a complete change history, enabling point-in-time recovery and full audit logs",
          "Disaster recovery requires only backups, not CDC",
          "Audit trails should never use CDC",
        ],
        correct: "2",
        explanation:
          "CDC captures every change with timestamps and metadata, creating a comprehensive audit trail. This enables point-in-time recovery (replay to any moment), compliance auditing (who changed what, when), and forensic investigation. Combined with log retention or archival, CDC becomes a powerful DR and governance tool.",
      },
    ],
  },
};
