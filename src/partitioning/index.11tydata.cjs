module.exports = {
  heroConfig: {
    title: 'Partitioning & Reconciliation',
    description: '<p>Design Kafka topics that preserve per-entity ordering, tame skew, and make late arrivals safe with watermarks and versioning.</p>',
    align: 'left',
    actions: [
      { href: '#ordering', label: 'Respect Ordering' },
      { href: '#key-choice', label: 'Pick Partition Keys', variant: 'ghost' }
    ]
  }
};
