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
curl -O {{ site.origin ~ ('/downloads/docker-compose-observability.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/prometheus.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/prometheus-alerts.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/jmx-exporter-config.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/grafana-datasources.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/grafana-dashboards.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/grafana-kafka-connect-dashboard.json' | url) }}
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

### Integrating with Alertmanager for External Alert Routing

The base observability stack includes Prometheus alerts that appear in the Prometheus UI. To route these alerts to external systems like Slack, PagerDuty, email, or custom webhooks, you can add Alertmanager to your stack.

#### Quick Start with Alertmanager

We provide a ready-to-use Alertmanager configuration that extends the base monitoring stack:

```bash
# Download the Alertmanager extension files
curl -O {{ site.origin ~ ('/downloads/docker-compose.alerts.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/alertmanager.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/prometheus-with-alertmanager.yml' | url) }}

# Start the full stack with Alertmanager
docker-compose -f docker-compose-observability.yml -f docker-compose.alerts.yml up -d
```

#### What You Get

The Alertmanager extension includes:

- **Alert routing** by severity (critical → PagerDuty, warning → Slack)
- **Alert grouping** to reduce notification spam (groups by alertname, severity, connector)
- **Alert inhibition** rules to prevent cascading alerts (e.g., connector down suppresses lag alerts)
- **Rate limiting** with configurable repeat intervals (1h for critical, 12h for warnings)
- **Pre-configured receivers** for PagerDuty, Slack, email, and webhooks (requires your credentials)

Access the Alertmanager UI at http://localhost:9093 to:
- View active alerts
- See silences
- Test alert routing
- View alert groups and timing

#### Configuring Alert Receivers

The `alertmanager.yml` file includes pre-configured templates for common integrations. You just need to add your credentials:

**Slack Integration:**
1. Go to your Slack workspace → Apps → Incoming Webhooks
2. Create a new webhook and copy the URL
3. Edit `alertmanager.yml` and replace `<YOUR_SLACK_WEBHOOK_URL>` with your webhook URL
4. Customize the channel name (default: `#cdc-alerts-warnings`)
5. Reload configuration: `docker-compose restart alertmanager`

**PagerDuty Integration:**
1. Log into PagerDuty → Services → Your Service → Integrations
2. Add "Events API V2" integration and copy the Integration Key
3. Edit `alertmanager.yml` and replace `<YOUR_PAGERDUTY_INTEGRATION_KEY>`
4. Reload configuration: `docker-compose restart alertmanager`

**Email Integration:**
1. Uncomment the `global.smtp_*` settings in `alertmanager.yml`
2. Configure your SMTP server details (Gmail example included)
3. Uncomment the `email-ops` receiver section
4. Update email addresses for your team
5. Reload configuration: `docker-compose restart alertmanager`

**Custom Webhook Integration:**
1. Uncomment the `custom-webhook` receiver in `alertmanager.yml`
2. Update the URL to point to your webhook endpoint
3. Optionally configure authentication headers
4. The webhook will receive JSON payloads with full alert details

#### Alert Routing Strategy

The configuration implements a production-ready routing strategy:

```yaml
Critical Alerts (severity: critical)
├─> PagerDuty (wakes up on-call)
├─> Faster delivery (10s group_wait)
└─> Repeat every 1 hour if not resolved

Warning Alerts (severity: warning)
├─> Slack #cdc-alerts-warnings
├─> Standard delivery (5m group_wait)
└─> Repeat every 12 hours if not resolved

SLO Alerts (label: slo)
├─> Slack #cdc-slo-tracking
├─> Longer group_wait (5m)
└─> Repeat every 6 hours
```

#### Alert Grouping and Deduplication

Alertmanager groups alerts to reduce noise:

- **By connector**: All alerts for the same connector group together
- **By severity**: Critical alerts group separately from warnings
- **By alert name**: Same alert type fires once per group
- **Time windows**: 
  - Initial alert waits 30s to group with similar alerts
  - New alerts in group wait 5m before notification
  - Resolved alerts trigger a "recovery" notification

#### Alert Inhibition (Preventing Alert Storms)

The configuration includes smart inhibition rules:

```yaml
Connector Down
  ↓ suppresses ↓
├─> High Lag Alert
├─> Low Throughput Alert  
└─> No Offset Commits Alert

High Error Rate
  ↓ suppresses ↓
└─> DLQ Volume Spike (same root cause)

Any Critical Alert
  ↓ suppresses ↓
└─> Related Warning Alerts (same connector)
```

This prevents receiving 10 alerts when the root cause is a single failed connector.

#### Rate Limiting Best Practices

The configuration implements sensible rate limits:

| Alert Type | Initial Delay | Group Interval | Repeat Interval |
|------------|---------------|----------------|-----------------|
| Critical   | 10 seconds    | 5 minutes      | 1 hour          |
| Warning    | 5 minutes     | 5 minutes      | 12 hours        |
| SLO        | 5 minutes     | 5 minutes      | 6 hours         |

**Why these intervals?**
- **Critical (1h repeat)**: On-call engineer needs regular reminders until fixed
- **Warning (12h repeat)**: Business hours follow-up, less urgency
- **SLO (6h repeat)**: Tracks trends, doesn't require immediate action

You can adjust these in `alertmanager.yml` under `route.repeat_interval`.

#### Maintenance Windows (Silencing Alerts)

Use the Alertmanager UI to create silences during planned maintenance:

1. Use your OS-specific command to open the Alertmanager UI:
   ```bash
   # macOS
   open http://localhost:9093
   # Linux
   xdg-open http://localhost:9093
   # Windows (PowerShell)
   start http://localhost:9093
   ```
2. Click "Silences" → "New Silence"
3. Add matchers (e.g., `connector="inventory-connector"`)
4. Set duration and comment
5. Alerts matching the silence won't trigger notifications

For recurring maintenance windows, use `mute_time_intervals` in `alertmanager.yml`:

```yaml
mute_time_intervals:
  - name: 'weekend-maintenance'
    time_intervals:
      - times:
          - start_time: '02:00'
            end_time: '04:00'
        weekdays: ['saturday', 'sunday']
```

Then reference in your route:
```yaml
routes:
  - match:
      severity: warning
    receiver: 'slack-warnings'
    mute_time_intervals:
      - 'weekend-maintenance'
```

#### Cloud-Managed Alternatives

For production environments, consider using managed alerting services instead of self-hosting Alertmanager:

**AWS CloudWatch:**
- Use Prometheus remote_write to send metrics to Amazon Managed Service for Prometheus
- Configure CloudWatch Alarms for CDC metrics
- Route to SNS topics → Lambda → Slack/PagerDuty/Email

**Grafana Cloud:**
- Enable Grafana Cloud Alerting
- Import our alert rules directly into Grafana
- Use built-in integrations for Slack, PagerDuty, email, etc.
- Benefits: automatic deduplication, mobile app, escalation chains

**Datadog:**
- Install Datadog agent alongside Prometheus
- Convert Prometheus queries to Datadog monitors
- Use Datadog's native integrations for notifications
- Benefits: APM tracing, log correlation, incident management

**PagerDuty Event Intelligence:**
- Send alerts directly from Prometheus using webhook receiver
- PagerDuty provides automatic grouping, deduplication, and ML-based noise reduction
- Best for teams already using PagerDuty for on-call management

**Opsgenie:**
- Similar to PagerDuty, native integration with Prometheus/Alertmanager
- Advanced routing with on-call schedules and escalation policies
- Benefits: integrated incident response, mobile app, status pages

#### Testing Your Alert Configuration

Before deploying to production, test your alert routing:

```bash
# 1. Check Alertmanager configuration is valid
docker exec cdc-alertmanager amtool check-config /etc/alertmanager/alertmanager.yml

# 2. View current alert routing
docker exec cdc-alertmanager amtool config routes show

# 3. Test a specific alert route (dry run)
docker exec cdc-alertmanager amtool config routes test \
  alertname=KafkaConnectHighLag \
  severity=critical \
  connector=inventory-connector

# 4. Send a test alert manually
curl -H "Content-Type: application/json" -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning",
    "connector": "test-connector"
  },
  "annotations": {
    "summary": "This is a test alert",
    "description": "Testing Alertmanager routing configuration"
  }
}]' http://localhost:9093/api/v1/alerts

# 5. Check alert was received
curl http://localhost:9093/api/v1/alerts
```

#### Troubleshooting Alert Delivery

**Alerts not showing in Alertmanager:**
1. Check Prometheus is sending alerts: http://localhost:9090/alerts
2. Verify Prometheus can reach Alertmanager: check logs with `docker logs cdc-prometheus`
3. Confirm Alertmanager target is UP in Prometheus: http://localhost:9090/targets

**Alerts not reaching Slack/PagerDuty:**
1. Check Alertmanager logs: `docker logs cdc-alertmanager`
2. Verify webhook URL/API key is correct in `alertmanager.yml`
3. Test network connectivity: `docker exec cdc-alertmanager curl -I https://hooks.slack.com`
4. Check Alertmanager status page: http://localhost:9093/#/status

**Too many notifications (alert fatigue):**
1. Increase `repeat_interval` in alert routes
2. Adjust alert thresholds in `prometheus-alerts.yml`
3. Add more inhibition rules to suppress related alerts
4. Increase `group_interval` to batch more alerts together

**Alerts resolved but still getting notifications:**
1. Check `resolve_timeout` in Alertmanager config (default: 5m)
2. Verify Prometheus is sending "resolved" notifications
3. Ensure receivers have `send_resolved: true` (default for most receivers)

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
   - Use your OS-specific command to open the Prometheus targets page:
     ```bash
      # macOS
      open http://localhost:9090/targets
      # Linux
      xdg-open http://localhost:9090/targets
      # Windows (PowerShell)
      start http://localhost:9090/targets
     ```
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
   - Use your OS-specific command to open the Prometheus UI:
     ```bash
     # macOS
     open http://localhost:9090
     # Linux
     xdg-open http://localhost:9090
     # Windows (PowerShell)
     start http://localhost:9090
     ```
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
