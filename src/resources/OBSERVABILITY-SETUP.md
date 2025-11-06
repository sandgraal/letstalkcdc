# CDC Observability Setup Guide

This guide shows you how to set up complete observability for your Kafka Connect CDC pipeline using Prometheus and Grafana.

## 📋 What's Included

This observability package provides:

- **Grafana Dashboard** (`grafana-kafka-connect-dashboard.json`) — Pre-built dashboard with 8 panels covering:
  - Replication lag gauge
  - Throughput trends (source and sink)
  - Error rate monitoring
  - Connector status overview
  - Dead Letter Queue volume tracking
  - Task running ratio
  - Restart counts
  - Batch processing time

- **Prometheus Alert Rules** (`prometheus-alerts.yml`) — Production-ready alerts for:
  - **Primary alerts** (page on-call):
    - High lag (> 5 minutes)
    - No offset commits with active events
    - DLQ volume spikes
    - Connector not running
    - High error rates
  - **Warning alerts** (follow up during business hours):
    - Low source log retention
    - Excessive restarts
    - Low throughput
    - Task saturation
    - Slow batch processing
  - **SLO-based alerts**:
    - Freshness SLO breach (P99 > 5 min)
    - Availability SLO breach (< 99% uptime)
    - Completeness risk

- **Docker Compose Stack** (`docker-compose-observability.yml`) — Complete monitoring environment with:
  - Kafka + Zookeeper
  - Kafka Connect with JMX enabled
  - PostgreSQL (Debezium example)
  - JMX Exporter
  - Prometheus
  - Grafana
  - kcat (Kafka CLI tool)

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available
- Ports available: 2181, 5432, 8083, 9090, 3000, 5556

### Step 1: Download All Files

Download all files from the `/downloads/` directory:

```bash
# Create a directory for your CDC monitoring setup
mkdir cdc-monitoring && cd cdc-monitoring

# Download all required files from the repository
# Replace with your actual site URL or use the GitHub raw URLs
curl -O https://sandgraal.github.io/letstalkcdc/downloads/docker-compose-observability.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/prometheus.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/prometheus-alerts.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/jmx-exporter-config.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/grafana-datasources.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/grafana-dashboards.yml
curl -O https://sandgraal.github.io/letstalkcdc/downloads/grafana-kafka-connect-dashboard.json
```

### Step 2: Start the Stack

```bash
# Start all services
docker-compose -f docker-compose-observability.yml up -d

# Wait for services to be ready (30-60 seconds)
docker-compose -f docker-compose-observability.yml ps
```

### Step 3: Access the Monitoring Tools

- **Grafana**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
  - Dashboard is pre-loaded and set as home

- **Prometheus**: http://localhost:9090
  - Query interface for raw metrics
  - Alert rules status at `/alerts`

- **Kafka Connect**: http://localhost:8083
  - REST API for connector management

- **JMX Exporter**: http://localhost:5556/metrics
  - Raw Prometheus metrics from Kafka Connect

### Step 4: Create a Test Connector

```bash
# Register the Debezium PostgreSQL connector
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "inventory-connector",
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "plugin.name": "pgoutput",
      "database.hostname": "pg",
      "database.port": "5432",
      "database.user": "postgres",
      "database.password": "postgres",
      "database.dbname": "inventory",
      "topic.prefix": "server1",
      "slot.name": "debezium",
      "table.include.list": "inventory.customers,inventory.orders",
      "heartbeat.interval.ms": "10000"
    }
  }'
```

### Step 5: Generate Test Data

```bash
# Connect to PostgreSQL
docker exec -it cdc-postgres psql -U postgres -d inventory

# Insert test records
INSERT INTO inventory.customers (first_name, last_name, email) 
VALUES ('John', 'Doe', 'john@example.com');

INSERT INTO inventory.orders (order_date, purchaser, quantity, product_id) 
VALUES (NOW(), 1001, 5, 101);

# Exit PostgreSQL
\q
```

### Step 6: View Metrics

1. Open Grafana at http://localhost:3000
2. The Kafka Connect CDC dashboard should load automatically
3. Select your connector from the dropdown
4. Watch metrics update in real-time

## 📊 Dashboard Panels Explained

### 1. Current Replication Lag
- **What it shows**: Time between source commit and sink processing
- **Thresholds**: 
  - Green: < 60 seconds
  - Yellow: 60s - 5 minutes
  - Red: > 5 minutes
- **Action if red**: Check connector health, verify sink capacity

### 2. Throughput (Records/sec)
- **What it shows**: Rate of records processed by source and sink
- **Use case**: Identify bottlenecks, capacity planning
- **Watch for**: Sustained drops or divergence between source and sink

### 3. Error Rate
- **What it shows**: Errors logged per second by connector tasks
- **Threshold**: Alert if consistently > 0
- **Action if elevated**: Check logs, review poison pill messages

### 4. Connector Status
- **What it shows**: Current state (RUNNING, FAILED, PAUSED)
- **Expected state**: RUNNING (green)
- **Action if not running**: Review connector logs, restart if needed

### 5. Dead Letter Queue Volume
- **What it shows**: Messages in DLQ topics over time
- **Threshold**: Alert on 3x spike above baseline
- **Action if spiking**: Sample DLQ messages, fix data quality issues

### 6. Connector Task Running Ratio
- **What it shows**: Percentage of time tasks spend processing vs idle
- **Threshold**: < 70% indicates potential saturation
- **Action if low**: Scale out tasks, optimize batch size

### 7. Connector Restarts
- **What it shows**: Number of restarts in the last hour
- **Threshold**: > 3 per hour is concerning
- **Action if high**: Review logs for recurring errors, check resources

### 8. Batch Processing Time
- **What it shows**: Average time to process each batch
- **Watch for**: Increasing trend over time
- **Action if increasing**: Check sink performance, review transformations

## 🚨 Alert Configuration

### Customizing Alert Thresholds

Edit `prometheus-alerts.yml` to adjust thresholds:

```yaml
# Example: Change lag threshold from 5 minutes to 2 minutes
- alert: KafkaConnectHighLag
  expr: |
    (kafka_connect_source_connector_metrics_source_record_poll_total - 
     kafka_connect_sink_connector_metrics_sink_record_send_total) > 120000  # Changed from 300000
  for: 5m
```

Reload Prometheus configuration:
```bash
curl -X POST http://localhost:9090/-/reload
```

### Integrating with Alertmanager

To send alerts to PagerDuty, Slack, email, etc:

1. Add Alertmanager service to `docker-compose-observability.yml`
2. Configure routing in `alertmanager.yml`
3. Update Prometheus to point to Alertmanager

Example Alertmanager config:
```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'default'
    # ... configure default receiver
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<your-pagerduty-key>'
  - name: 'slack'
    slack_configs:
      - api_url: '<your-slack-webhook>'
```

## 🔧 Production Deployment

### Checklist for Production

- [ ] **Update runbook URLs** in alert annotations to point to your internal docs
- [ ] **Configure Alertmanager** with proper routing to on-call and stakeholders
- [ ] **Set up persistent storage** for Prometheus and Grafana data
- [ ] **Enable authentication** on Grafana (change default password)
- [ ] **Review SLO targets** and adjust based on your requirements
- [ ] **Add backup/restore** procedures for dashboard configurations
- [ ] **Configure retention** policies in Prometheus (default: 15 days)
- [ ] **Set up high availability** for Prometheus if needed
- [ ] **Add SSL/TLS** termination if exposing externally
- [ ] **Configure firewall rules** to restrict access

### Scaling Considerations

For production CDC pipelines:

1. **Prometheus**:
   - Use remote write to long-term storage (Thanos, Cortex, Mimir)
   - Set appropriate retention based on query patterns
   - Consider federation for multi-cluster setups

2. **Grafana**:
   - Use external database (PostgreSQL) instead of SQLite
   - Set up LDAP/SAML authentication
   - Create separate dashboards for different teams/environments

3. **JMX Exporter**:
   - Run as sidecar container for isolation
   - Tune scrape intervals based on metric cardinality
   - Filter metrics to reduce overhead

## 📚 Metric Reference

### Key Kafka Connect Metrics

| Metric | Description | Type | Alert Threshold |
|--------|-------------|------|-----------------|
| `kafka_connect_source_connector_metrics_source_record_poll_total` | Total records polled from source | Counter | N/A |
| `kafka_connect_sink_connector_metrics_sink_record_send_total` | Total records sent to sink | Counter | N/A |
| `kafka_connect_connector_task_metrics_total_errors_logged_total` | Total errors logged by task | Counter | > 1/sec for 5m |
| `kafka_connect_connector_status` | Connector state (RUNNING=1) | Gauge | != RUNNING for 2m |
| `kafka_connect_connector_task_metrics_total_restarts_total` | Total task restarts | Counter | > 3 in 1h |
| `kafka_connect_connector_task_metrics_running_ratio` | Task time spent running | Gauge | < 0.7 for 15m |
| `kafka_topic_partition_current_offset` | Current offset in topic | Gauge | Used for DLQ tracking |

### Calculating Lag

Lag is calculated as:
```
lag = source_record_poll_total - sink_record_send_total
```

This gives the number of records waiting to be processed. For time-based lag, you need to instrument your connector to track timestamps.

## 🐛 Troubleshooting

### Metrics Not Appearing

1. **Check JMX Exporter is running**:
   ```bash
   curl http://localhost:5556/metrics | grep kafka_connect
   ```

2. **Verify Prometheus is scraping**:
   - Open http://localhost:9090/targets
   - Check `kafka-connect` target status

3. **Check connector JMX exposure**:
   ```bash
   docker logs cdc-connect | grep JMX
   ```

### Dashboard Showing "No Data"

1. **Ensure connector is created and running**:
   ```bash
   curl http://localhost:8083/connectors
   ```

2. **Check metric names match dashboard queries**:
   - Open Prometheus at http://localhost:9090
   - Run query: `kafka_connect_connector_status`
   - If no results, JMX exporter config may need adjustment

3. **Verify time range in Grafana**:
   - Check dashboard time picker (top right)
   - Try "Last 5 minutes" for recent data

### High Memory Usage

JMX and metrics collection can be resource-intensive:

1. **Limit metric cardinality** in `jmx-exporter-config.yml`
2. **Increase scrape interval** in `prometheus.yml` (e.g., 30s → 60s)
3. **Allocate more RAM** to Prometheus (edit docker-compose)

## 🔗 Additional Resources

- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
- [Kafka Connect Monitoring](https://docs.confluent.io/platform/current/connect/monitoring.html)
- [Debezium Metrics](https://debezium.io/documentation/reference/stable/operations/monitoring.html)

## 📝 Next Steps

After setting up monitoring:

1. **Establish baselines**: Run for 1-2 weeks to understand normal patterns
2. **Tune alert thresholds**: Adjust based on observed behavior
3. **Create runbooks**: Document remediation steps for each alert
4. **Set SLOs**: Define freshness, availability, and completeness targets
5. **Review regularly**: Weekly ops sync to discuss trends and incidents

For more CDC observability guidance, see the [Observability page](/observability/).

---

**Need help?** File an issue on the GitHub repo or check the troubleshooting section above.
