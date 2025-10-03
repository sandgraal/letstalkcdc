module.exports = {
  quickstartCards: [
    {
      icon: '🐘',
      title: 'postgres',
      description: 'enable logical decoding, register Debezium, verify change events end-to-end.',
      list: [
        '<code>wal_level=logical</code>, slots allowed',
        'PKs or <code>REPLICA IDENTITY FULL</code>'
      ],
      actions: [
        { href: 'quickstart/quickstart-postgres/', label: 'open postgres quickstart' }
      ],
      meta: '~10–15 min'
    },
    {
      icon: '🐬',
      title: 'mysql',
      description: 'binlog in row mode, narrow includes, confirm topics receive events.',
      list: [
        '<code>binlog_format=ROW</code>',
        '<code>gtid_mode=ON</code> preferred'
      ],
      actions: [
        { href: 'quickstart/quickstart-mysql/', label: 'open mysql quickstart' }
      ],
      meta: '~10–15 min'
    },
    {
      icon: '🟠',
      title: 'oracle',
      description: 'check ARCHIVELOG + supplemental logging, verify redo and events.',
      list: [
        'ARCHIVELOG mode',
        'DB + table supplemental logging'
      ],
      actions: [
        { href: 'quickstart/quickstart-oracle/', label: 'open oracle quickstart' }
      ],
      meta: '~15–20 min'
    }
  ],
  acceptanceLinks: [
    {
      href: '/tests/',
      label: 'open test guide',
      description: 'Shell walkthrough for verifying the lab stack end-to-end.'
    }
  ],
  toolCards: [
    {
      icon: '🧩',
      title: 'mermaid diagram sandbox',
      description: 'sketch CDC dataflows, failure paths, and recovery playbooks right in the browser.',
      actions: [
        { href: 'mermaid-sandbox/', label: 'open mermaid sandbox' }
      ],
      meta: 'great for sharing designs'
    },
    {
      icon: '📒',
      title: 'oracle notes',
      description: 'prereqs, quick checks, performance knobs, and first-aid for Oracle log-based CDC.',
      actions: [
        { href: 'oracle-notes/', label: 'open oracle notes' }
      ],
      meta: 'single-page runbook'
    },
    {
      icon: '🧪',
      title: 'troubleshooting',
      description: 'the first 15 minutes: stabilize incidents fast with copy/paste diagnostics.',
      actions: [
        { href: 'troubleshooting/', label: 'open troubleshooting' }
      ],
      meta: 'postgres • mysql • oracle • kafka'
    },
    {
      icon: '🧰',
      title: 'merge / upsert cookbook',
      description: 'copy-paste templates for Snowflake, BigQuery, Delta, Postgres, MySQL, and Redshift. handles dupes, late events, and deletes safely.',
      actions: [
        { href: 'merge-cookbook/', label: 'open merge cookbook' }
      ],
      meta: 'latest-wins &amp; delete-safe'
    },
    {
      icon: '🧪',
      title: 'hands-on lab',
      description: 'spin up Kafka, Connect, and Postgres with guided commands to prove CDC end-to-end.',
      actions: [
        { href: 'lab-kafka-debezium/', label: 'open lab' }
      ],
      meta: 'end-to-end pipeline drill'
    },
    {
      icon: '🧮',
      title: 'debezium event decoder',
      description: 'paste a Kafka record; get op/source, before/after diff, and ready-to-tweak MERGE SQL.',
      actions: [
        { href: 'debezium-decoder/', label: 'open decoder' }
      ],
      meta: 'local only • no upload'
    },
    {
      icon: '🩺',
      title: 'DLQ triage assistant',
      description: 'enumerate, peek headers, decode original payload, and map errors to fixes.',
      actions: [
        { href: 'dlq-triage/', label: 'open DLQ triage' }
      ],
      meta: 'safe commands • copy-ready'
    },
    {
      icon: '⚙️',
      title: 'connector config builder',
      description: 'generate Debezium configs with DLQ, snapshot, and routing options; copy or curl to Connect.',
      actions: [
        { href: 'connector-builder/', label: 'open config builder' }
      ],
      meta: 'postgres • mysql • oracle'
    },
    {
      icon: '⚙️',
      title: 'nuances & errata',
      description: 'corrections, caveats, and sharp edges across CDC: delivery guarantees, snapshots &amp; replays, tombstones, schema evolution, and ops guardrails.',
      actions: [
        { href: 'errata/', label: 'see nuances' }
      ]
    }
  ]
};
