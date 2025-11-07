module.exports = {
  seriesKey: 'schema-evolution',
  heroConfig: {
    title: 'Handling Schema Evolution in CDC',
    description: '<p>Keep downstream systems humming as source schemas change. Learn how schema registries, compatibility modes, and message contracts safeguard your pipelines from drift.</p>',
    align: 'center',
    skillLevel: 'Advanced',
    actions: [
      { href: '#solution', label: 'Use a Schema Registry' },
      { href: '#compatibility', label: 'Choose Compatibility Modes', variant: 'ghost' }
    ]
  },
  quizConfig: {
    id: "schema-evolution-quiz",
    title: "Schema Evolution Knowledge Check",
    description: "Test your understanding of schema compatibility and evolution strategies.",
    questions: [
      {
        question: "What is the primary purpose of a schema registry in CDC?",
        options: [
          "To store database credentials securely",
          "To centrally manage, version, and enforce schema contracts between producers and consumers",
          "To compress event payloads",
          "To route messages to different topics"
        ],
        correct: "2",
        explanation: "A schema registry acts as a central catalog for event schemas. Producers register schemas, consumers retrieve them, and the registry enforces compatibility rules during schema evolution. This prevents breaking changes from reaching consumers and provides a version history for troubleshooting and rollbacks."
      },
      {
        question: "What does 'backward compatibility' mean in schema evolution?",
        options: [
          "New schemas can read data written with the old schema",
          "Old consumers can read data written with the new schema",
          "Schemas can never change",
          "All schema changes are automatically applied"
        ],
        correct: "2",
        explanation: "Backward compatibility means old consumers (using the previous schema version) can successfully read data produced with the new schema. This typically allows adding optional fields or removing fields (as long as consumers handle missing fields). It's essential for zero-downtime deployments where consumers lag behind producers."
      },
      {
        question: "What does 'forward compatibility' mean in schema evolution?",
        options: [
          "New consumers can read data written with old schemas",
          "Schemas are always future-proof",
          "All changes are applied immediately",
          "Old producers can write using new schemas"
        ],
        correct: "1",
        explanation: "Forward compatibility means new consumers (using the updated schema) can read data produced with older schema versions. This allows producers to update at their own pace, knowing newer consumers will handle legacy data gracefully. It's useful when producers can't all be updated simultaneously."
      },
      {
        question: "Why should you avoid removing required fields in schema evolution?",
        options: [
          "It has no impact on consumers",
          "Removing required fields breaks consumers expecting that field, violating backward compatibility",
          "Required fields can always be removed safely",
          "Schema registries don't allow any field removal"
        ],
        correct: "2",
        explanation: "Removing a required field breaks backward compatibility because old consumers expect that field to exist. If it's missing, they may fail or corrupt data. Safe evolution strategies include: making fields optional before removal, providing defaults, or versioning the event type to signal a breaking change."
      },
      {
        question: "What is a common strategy when you need to make a breaking schema change?",
        options: [
          "Just make the change and hope for the best",
          "Create a new event type or topic version, allowing parallel migration before deprecating the old schema",
          "Delete all existing data first",
          "Breaking changes are impossible with a schema registry"
        ],
        correct: "2",
        explanation: "When a breaking change is unavoidable (e.g., changing field types or semantics), the safest approach is to create a new event type or topic version (e.g., orders_v2). This allows consumers to migrate at their own pace, reading from both old and new versions during the transition, before eventually deprecating the old schema."
      }
    ]
  }
};
