module.exports = {
  seriesKey: 'multi-tenancy',
  heroConfig: {
    title: 'Multi-Tenancy: Cost vs Isolation',
    description: '<p>Model isolation levels, topic strategies, and egress math for shared CDC platforms. See how per-tenant choices affect blast radius, spend, and operations.</p>',
    align: 'center',
    actions: [
      { href: '#mt-primer', label: 'Start with the Primer' },
      { href: '#mt-controls', label: 'Tweak Isolation Controls', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "multi-tenancy-quiz",
    title: "Multi-Tenancy Knowledge Check",
    description: "Test your understanding of tenant isolation strategies and operational trade-offs.",
    questions: [
      {
        question: "What is the key trade-off when choosing between shared and dedicated topics per tenant in a CDC platform?",
        options: [
          "Shared topics are always faster than dedicated topics",
          "Shared topics reduce operational complexity but increase blast radius; dedicated topics provide isolation at higher operational cost",
          "Dedicated topics can't handle high throughput",
          "Shared topics don't support partitioning"
        ],
        correct: "2",
        explanation: "Shared topics (with tenant IDs in the key/payload) reduce the number of topics to manage, simplifying operations. However, a misbehaving tenant can affect others. Dedicated topics per tenant provide strong isolation—failures are contained—but multiply operational overhead (monitoring, configuration, partition management)."
      },
      {
        question: "What does 'blast radius' mean in the context of multi-tenant CDC systems?",
        options: [
          "The physical distance data travels across networks",
          "The scope of impact when one tenant's workload or failure affects other tenants",
          "The size of log files generated",
          "The number of databases being replicated"
        ],
        correct: "2",
        explanation: "Blast radius refers to how many tenants are impacted by a single failure or resource contention. In shared infrastructure (shared topics, shared connectors), one tenant's spike or error can degrade service for all. Isolation strategies (dedicated topics, quotas, separate clusters) reduce blast radius."
      },
      {
        question: "Why might you use topic prefixes or namespaces for multi-tenant CDC?",
        options: [
          "To make topic names longer and more descriptive",
          "To organize topics by tenant for easier management, monitoring, and ACL application",
          "Topic prefixes are required by Kafka",
          "To avoid using partition keys"
        ],
        correct: "2",
        explanation: "Topic prefixes/namespaces (e.g., tenant-123.orders, tenant-456.orders) help organize topics by tenant, making it easier to apply ACLs, monitor per-tenant metrics, identify ownership, and automate operations. This organizational structure supports scalable multi-tenancy without mixing tenant data."
      },
      {
        question: "What is a common challenge when estimating egress costs in a multi-tenant CDC platform?",
        options: [
          "Egress is always free in CDC systems",
          "Different tenants have varying change volumes and destinations, making cost unpredictable",
          "Egress only applies to batch systems",
          "CDC doesn't produce any network egress"
        ],
        correct: "2",
        explanation: "In multi-tenant CDC, tenants have different workloads: some produce high-volume changes, others low. They may stream to different clouds or regions, affecting egress rates. Accurately estimating per-tenant egress costs is crucial for billing, capacity planning, and avoiding surprises, especially when crossing cloud boundaries."
      },
      {
        question: "What role do Kafka quotas play in multi-tenant CDC platforms?",
        options: [
          "Quotas are not supported in Kafka",
          "Quotas limit per-client throughput or request rates to prevent one tenant from starving others",
          "Quotas increase throughput for all clients",
          "Quotas are only used for authentication"
        ],
        correct: "2",
        explanation: "Kafka supports producer and consumer quotas (throughput and request rate limits) per client ID or user. In multi-tenant CDC, quotas prevent a single tenant from consuming all broker resources (network, disk I/O, CPU), ensuring fair resource allocation and protecting the platform from abuse or runaway workloads."
      }
    ]
  }
};
