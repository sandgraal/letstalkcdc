export default {
  heroConfig: {
    title: 'Why Change Data Capture Still Breaks, and How To Get It Right.',
    description: 'Build production-grade CDC pipelines, understand why they fail, and learn how to design resilient, real-time data architectures.',
    align: 'center',
    actions: [
      { href: '/overview/', label: 'Start the Journey' },
      { href: '/design-system/', label: 'Design System', variant: 'ghost' }
    ]
  },
  learningModules: [
    {
      title: '1. Interactive Introduction to CDC',
      description: 'This interactive introduction is the central starting point for your CDC journey. Get a firm grasp on the core concepts, methods, and tooling, then choose the path that fits your needs—from beginner fundamentals to advanced production patterns.',
      href: '/overview/',
      ctaLabel: 'Choose what to Read'
    },
    {
      title: '2. Core Concepts and Mechanics',
      description: 'Dive into the mechanics. Learn about the transaction log, change tables, and the essential metadata that powers CDC from the ground up.',
      href: '/intro/',
      ctaLabel: 'Learn the Concepts'
    },
    {
      title: '3. The Three Pillars of CDC (The Patterns)',
      description: 'Compare the primary implementation patterns: Log-based, Trigger-based, and Timestamp-based. Understand the pros and cons of each.',
      href: '/strategy/',
      ctaLabel: 'Explore the Patterns'
    },
    {
      title: '4. Implementation and The Data Pipeline',
      description: 'Put theory into practice. See how CDC fits into modern ETL/ELT pipelines and integrates with streaming platforms like Apache Kafka.',
      href: '/quickstarts/',
      ctaLabel: 'View Implementations'
    },
    {
      title: '5. Advanced Topics',
      description: 'Level up your knowledge. Tackle complex challenges like handling Slowly Changing Dimensions (SCD) and managing schema drift in production systems.',
      href: '/schema-evolution/',
      ctaLabel: 'Go Advanced'
    },
    {
      title: '6. The Ecosystem',
      description: 'Explore the landscape of CDC technologies. Get a curated overview of the most popular open-source and commercial tools in the ecosystem.',
      href: '/tooling/',
      ctaLabel: 'Discover the Tools'
    }
  ]
};
