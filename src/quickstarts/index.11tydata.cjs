module.exports = {
  seriesKey: 'quickstarts',
  heroConfig: {
    title: 'CDC Quickstart Guides',
    description: '<p>Bring your first change data capture pipeline online fast. Choose your source database and follow a copy-paste friendly walkthrough with checkpoints and sanity checks.</p>',
    align: 'center',
    actions: [
      { href: '#quickstart-grid', label: 'Pick a Database' },
      { href: '/tests/', label: 'Run Acceptance Tests', variant: 'ghost' },
      { href: '/quickstarts/quickstart-postgres/', label: 'Start with Postgres', variant: 'ghost' }
    ]
  },
  quickstartDetails: [
    {
      icon: '🐘',
      title: 'Postgres',
      description: 'Enable logical decoding, register Debezium, verify change events end-to-end.',
      list: [
        '<code>wal_level=logical</code>, slots allowed',
        'Primary keys or <code>REPLICA IDENTITY FULL</code>'
      ],
      actions: [
        { href: '/quickstarts/quickstart-postgres/', label: 'Open Postgres quickstart' },
        { href: '/tests/', label: 'Run Acceptance Tests', variant: 'ghost' }
      ],
      meta: '~10–15 min'
    },
    {
      icon: '🐬',
      title: 'MySQL',
      description: 'Put the binlog in ROW mode, narrow includes, confirm Debezium captures changes.',
      list: [
        '<code>binlog_format=ROW</code>',
        '<code>gtid_mode=ON</code> preferred'
      ],
      actions: [
        { href: '/quickstarts/quickstart-mysql/', label: 'Open MySQL quickstart' },
        { href: '/tests/', label: 'Run Acceptance Tests', variant: 'ghost' }
      ],
      meta: '~10–15 min'
    },
    {
      icon: '🟠',
      title: 'Oracle',
      description: 'Check ARCHIVELOG + supplemental logging, then verify redo events arrive.',
      list: [
        'ARCHIVELOG mode enabled',
        'Database + table supplemental logging'
      ],
      actions: [
        { href: '/quickstarts/quickstart-oracle/', label: 'Open Oracle quickstart' },
        { href: '/tests/', label: 'Run Acceptance Tests', variant: 'ghost' }
      ],
      meta: '~15–20 min'
    },
    {
      icon: '🪟',
      title: 'SQL Server',
      description: 'Enable SQL Server CDC, configure the agent, then validate change flow to Kafka.',
      list: [
        'Database-level CDC enabled',
        'SQL Server Agent running'
      ],
      actions: [
        { href: '/quickstarts/quickstart-mssql/', label: 'Open SQL Server quickstart' },
        { href: '/tests/', label: 'Run Acceptance Tests', variant: 'ghost' }
      ],
      meta: '~15–20 min'
    }
  ]
};
