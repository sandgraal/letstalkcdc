# CDC Failure Scenario Drill Bundle

Version: 1.0.0  
Last Updated: 2025-11-07

## Overview

This bundle contains shell scripts for practicing four critical CDC failure scenarios in a safe lab environment. Each drill is designed to build troubleshooting fluency by intentionally breaking your CDC pipeline in controlled ways.

## Prerequisites

Before running these drills, ensure you have:

- **Running CDC Lab Setup**: Postgres, Kafka, Connect, and Debezium connector
  - See [Hands-On Lab Guide](https://letstalkcdc.github.io/letstalkcdc/lab-kafka-debezium/) for setup instructions
- **Docker and Docker Compose**: All scripts assume containers are running
- **Kafka CLI Tools**: `kafka-console-consumer`, `kafka-consumer-groups`, etc.
- **curl and jq**: For REST API calls and JSON parsing
- **Monitoring Dashboard**: Recommended but optional for observing metrics

## Safety Warnings

⚠️ **NEVER run these drills in production** without formal chaos engineering approval  
⚠️ **Always use a dedicated lab environment**  
⚠️ **Back up your data** before running offset wipe drills  
⚠️ **Document all observations** for learning and runbook creation

## Included Drills

### 1. Backpressure Simulation (`01-backpressure-drill.sh`)
**Duration**: ~15 minutes  
**Scenario**: Sink connector shutdown causing consumer lag buildup

**What You'll Learn**:
- How to monitor consumer lag metrics
- How Kafka buffers changes during sink outages
- When lag becomes critical
- Alert threshold tuning

**Usage**:
```bash
chmod +x 01-backpressure-drill.sh
./01-backpressure-drill.sh
```

**Environment Variables** (optional):
- `KAFKA_BOOTSTRAP`: Kafka bootstrap server (default: `localhost:29092`)
- `CONNECT_URL`: Kafka Connect REST API URL (default: `http://localhost:8083`)
- `SINK_CONNECTOR`: Sink connector name (default: `jdbc-sink-connector`)
- `CONSUMER_GROUP`: Consumer group to monitor (default: `sink-group-inventory`)

---

### 2. Dead Letter Queue (`02-dlq-drill.sh`)
**Duration**: ~20 minutes  
**Scenario**: Triggering serialization errors and DLQ handling

**What You'll Learn**:
- How to identify and diagnose serialization errors
- DLQ configuration and monitoring
- Error tolerance policies
- DLQ triage and message recovery

**Prerequisites**:
- Sink connector configured with DLQ settings (see `dlq-sink-config.json` example)

**Usage**:
```bash
chmod +x 02-dlq-drill.sh
./02-dlq-drill.sh
```

The script will prompt you to choose from three error scenarios:
1. Incompatible data type injection
2. Missing target table
3. Oversized payload

**Environment Variables** (optional):
- `KAFKA_BOOTSTRAP`: Kafka bootstrap server (default: `localhost:29092`)
- `CONNECT_URL`: Kafka Connect REST API URL (default: `http://localhost:8083`)
- `SINK_CONNECTOR`: Sink connector name (default: `jdbc-sink-connector`)
- `DLQ_TOPIC`: Dead letter queue topic (default: `dlq.sink.inventory`)

---

### 3. Schema Drift (`03-schema-drift-drill.sh`)
**Duration**: ~25 minutes  
**Scenario**: Testing breaking vs. non-breaking schema changes

**What You'll Learn**:
- How schema changes propagate through CDC pipelines
- Which changes are safe vs. breaking
- Schema evolution strategies
- Recovery patterns for schema drift

**Usage**:
```bash
chmod +x 03-schema-drift-drill.sh
./03-schema-drift-drill.sh
```

The script will prompt you to choose from five schema change scenarios:
1. Drop a column (breaking)
2. Change column type (breaking)
3. Add NOT NULL constraint (risky)
4. Add nullable column (safe)
5. Increase column width (safe)

**Environment Variables** (optional):
- `CONNECT_URL`: Kafka Connect REST API URL (default: `http://localhost:8083`)
- `SOURCE_CONNECTOR`: Source connector name (default: `inventory-connector`)

---

### 4. Offset Wipe & Replay (`04-offset-replay-drill.sh`)
**Duration**: ~30 minutes  
**Scenario**: Resnapshot and replay with idempotency testing

**What You'll Learn**:
- How CDC connectors manage offsets and state
- Snapshot vs. streaming mode behavior
- Safe offset reset procedures
- Idempotency validation

**Prerequisites**:
- Sink configured for UPSERT/idempotent writes
- Backup of current state recommended

**Usage**:
```bash
chmod +x 04-offset-replay-drill.sh
./04-offset-replay-drill.sh
```

**⚠️ Warning**: This drill deletes and recreates connectors. Always back up first!

**Environment Variables** (optional):
- `KAFKA_BOOTSTRAP`: Kafka bootstrap server (default: `localhost:29092`)
- `CONNECT_URL`: Kafka Connect REST API URL (default: `http://localhost:8083`)
- `SOURCE_CONNECTOR`: Source connector name (default: `inventory-connector`)
- `SINK_CONNECTOR`: Sink connector name (default: `jdbc-sink-connector`)
- `OFFSETS_TOPIC`: Connect offsets topic (default: `my_connect_offsets`)

---

## Configuration Files

### `dlq-sink-config.json`
Example sink connector configuration with Dead Letter Queue enabled:
```json
{
  "name": "jdbc-sink-connector",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSinkConnector",
    "tasks.max": "1",
    "topics": "server1.public.app_customer",
    "connection.url": "jdbc:postgresql://postgres-sink:5432/warehouse",
    "connection.user": "sink_user",
    "connection.password": "sink_password",
    "auto.create": "true",
    "insert.mode": "upsert",
    "pk.mode": "record_key",
    "errors.tolerance": "all",
    "errors.deadletterqueue.topic.name": "dlq.sink.inventory",
    "errors.deadletterqueue.context.headers.enable": "true",
    "errors.log.enable": "true",
    "errors.log.include.messages": "true"
  }
}
```

## Troubleshooting

### Scripts Fail with "command not found"
**Solution**: Ensure all prerequisites are installed:
- Kafka CLI tools in PATH
- Docker and docker-compose accessible
- curl and jq installed

### Docker containers not accessible
**Solution**: Verify containers are running:
```bash
docker ps | grep -E "postgres|kafka|connect"
```

### Connector API calls fail
**Solution**: Check Kafka Connect is running:
```bash
curl http://localhost:8083/connectors
```

### Permission denied on scripts
**Solution**: Make scripts executable:
```bash
chmod +x *.sh
```

## After Running Drills

1. **Document Your Observations**: Record metrics, error messages, and recovery times
2. **Create Runbooks**: Turn observations into actionable procedures
3. **Update Monitoring**: Adjust alert thresholds based on what you learned
4. **Share Knowledge**: Present findings to your team
5. **Schedule Regular Practice**: Run drills quarterly to maintain skills

## Resources

- **Full Guide**: [Failure Scenario Drills](https://letstalkcdc.github.io/letstalkcdc/troubleshooting/failure-drills/)
- **Lab Setup**: [Hands-On Lab: Kafka & Debezium](https://letstalkcdc.github.io/letstalkcdc/lab-kafka-debezium/)
- **Troubleshooting Guide**: [CDC Troubleshooting](https://letstalkcdc.github.io/letstalkcdc/troubleshooting/)
- **Observability**: [Monitoring Basics](https://letstalkcdc.github.io/letstalkcdc/observability/)

## Version History

- **1.0.0** (2025-11-07): Initial release with four core drills

## License

This drill bundle is part of the Let's Talk CDC educational project.  
Free to use for learning and workshop purposes.

## Feedback

Found an issue or have suggestions? Visit the [GitHub repository](https://github.com/sandgraal/letstalkcdc) to open an issue.
