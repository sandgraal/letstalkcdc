module.exports = {
  seriesKey: 'tooling',
  heroConfig: {
    title: 'The Modern CDC Toolkit',
    description: '<p>Compare open-source, managed, and enterprise CDC platforms. Balance operational control, cost, and depth of guarantees before you pick your stack.</p>',
    align: 'center',
    actions: [
      { href: '#open-source', label: 'Open Source Options' },
      { href: '#managed-cloud', label: 'Managed & SaaS', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "tooling-quiz",
    title: "CDC Tooling Knowledge Check",
    description: "Test your understanding of CDC tools and platform selection criteria.",
    questions: [
      {
        question: "What is Debezium, and why is it popular?",
        options: [
          "A database management system",
          "An open-source CDC platform built on Kafka Connect that supports multiple databases with log-based capture",
          "A message queue unrelated to CDC",
          "A cloud-only CDC service"
        ],
        correct: "2",
        explanation: "Debezium is a widely-adopted open-source CDC platform that integrates with Kafka Connect. It provides connectors for PostgreSQL, MySQL, Oracle, SQL Server, and more, using log-based capture to stream changes with low latency and minimal source impact. Its active community and extensibility make it a popular choice."
      },
      {
        question: "What is the main trade-off between open-source and managed CDC platforms?",
        options: [
          "Open-source is always better than managed",
          "Open-source offers control and cost savings but requires operational expertise; managed platforms reduce operational burden at higher cost",
          "Managed platforms don't support real-time CDC",
          "There is no difference between open-source and managed"
        ],
        correct: "2",
        explanation: "Open-source CDC (like Debezium) gives you full control, customization, and lower licensing costs—but you're responsible for deployment, scaling, monitoring, and maintenance. Managed platforms (Fivetran, AWS DMS, etc.) handle operations for you, reducing team burden and time-to-production, but at higher costs and with less flexibility."
      },
      {
        question: "What should you evaluate when selecting a CDC tool for your organization?",
        options: [
          "Only the price of the tool",
          "Supported databases, delivery guarantees, scalability, operational complexity, and ecosystem integration",
          "The logo design",
          "CDC tools are all identical"
        ],
        correct: "2",
        explanation: "Selecting a CDC tool requires evaluating: (1) source/sink database support, (2) delivery guarantees (ALO vs EOS), (3) scalability and throughput needs, (4) operational complexity (self-hosted vs managed), (5) integration with your existing stack (Kafka, cloud platforms, schemas), and (6) total cost of ownership including licensing and operational overhead."
      },
      {
        question: "What is the role of Kafka in many CDC architectures?",
        options: [
          "Kafka is not used in CDC",
          "Kafka serves as a durable, scalable message broker that buffers CDC events between sources and sinks",
          "Kafka replaces databases in CDC",
          "Kafka is only for batch processing"
        ],
        correct: "2",
        explanation: "Kafka acts as the central nervous system in many CDC architectures. It provides a durable, fault-tolerant, high-throughput buffer for change events. Multiple consumers can independently read at their own pace, events are retained for replays, and the pub-sub model decouples sources from sinks, enabling flexible, scalable data pipelines."
      },
      {
        question: "Why might an organization choose AWS DMS or similar cloud-native CDC services?",
        options: [
          "Cloud services are always cheaper than open-source",
          "Tight integration with cloud ecosystems, managed infrastructure, and simplified operations for cloud-native architectures",
          "Cloud CDC services don't support real-time streaming",
          "Open-source tools don't work in the cloud"
        ],
        correct: "2",
        explanation: "Cloud-native CDC services like AWS DMS, Google Datastream, or Azure Data Factory CDC integrate seamlessly with cloud services (S3, BigQuery, Redshift), require minimal operational overhead (fully managed), and simplify compliance/security. For cloud-first organizations, this tight integration and reduced ops burden often outweigh the higher cost and reduced flexibility."
      }
    ]
  }
};
