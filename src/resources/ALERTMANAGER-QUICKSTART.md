# Alertmanager Quick Start for CDC Monitoring

This guide shows you how to add Alertmanager to your CDC monitoring stack to route alerts to Slack, PagerDuty, email, or custom webhooks.

## What You Get

- **Alert routing** by severity (critical → PagerDuty, warning → Slack)
- **Smart grouping** to reduce notification noise
- **Deduplication** to prevent alert storms
- **Inhibition rules** that suppress cascading alerts
- **Rate limiting** with configurable repeat intervals

## Quick Start

### 1. Download the files

If you already have the base monitoring stack, just add these three files:

```bash
curl -O {{ site.origin ~ ('/downloads/docker-compose.alerts.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/alertmanager.yml' | url) }}
curl -O {{ site.origin ~ ('/downloads/prometheus-with-alertmanager.yml' | url) }}
```

### 2. Configure your receivers

Edit `alertmanager.yml` and add your credentials:

**For Slack:**
- Replace `<YOUR_SLACK_WEBHOOK_URL>` with your Slack webhook URL
- Get webhook from: Slack → Apps → Incoming Webhooks

**For PagerDuty:**
- Replace `<YOUR_PAGERDUTY_INTEGRATION_KEY>` with your integration key
- Get key from: PagerDuty → Services → Your Service → Integrations → Events API v2

**For Email:**
- Uncomment the `global.smtp_*` settings
- Add your SMTP server details and credentials

### 3. Start the stack with Alertmanager

```bash
# Start both base stack and Alertmanager extension
docker-compose -f docker-compose-observability.yml -f docker-compose.alerts.yml up -d

# Check services are running
docker-compose ps

# Access Alertmanager UI
{% include "snippets/open-url.njk" with { url: "http://localhost:9093" } %}
```

### 4. Test alert routing

Send a test alert:

```bash
curl -H "Content-Type: application/json" -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning",
    "connector": "test-connector"
  },
  "annotations": {
    "summary": "Testing Alertmanager configuration",
    "description": "This is a test alert to verify routing works"
  }
}]' http://localhost:9093/api/v1/alerts
```

Check Alertmanager received it:

- Use your OS-specific command to open the Alertmanager UI:
  ```bash
  {% include "snippets/open-url.njk" with { url: "http://localhost:9093" } %}
  ```
- You should see the test alert listed

If you configured Slack/PagerDuty, you should receive notifications!

## Architecture

```
Prometheus → Alertmanager → External Systems
                ├─> PagerDuty (critical)
                ├─> Slack (warnings)
                ├─> Email (ops team)
                └─> Webhooks (custom)
```

## Alert Routing Logic

The configuration routes alerts based on severity:

- **Critical alerts** → PagerDuty (repeat every 1 hour)
- **Warning alerts** → Slack #cdc-alerts-warnings (repeat every 12 hours)
- **SLO alerts** → Slack #cdc-slo-tracking (repeat every 6 hours)

## Inhibition Rules

Smart suppression to prevent alert storms:

- Connector down → suppresses lag/throughput/offset alerts
- High error rate → suppresses DLQ volume alerts
- Any critical alert → suppresses related warnings

## Troubleshooting

**Alerts not appearing in Alertmanager:**
1. Check Prometheus alerts page: http://localhost:9090/alerts
2. Verify Prometheus logs: `docker logs cdc-prometheus`
3. Check Alertmanager is listed as target in Prometheus: http://localhost:9090/targets

**Alerts not reaching Slack/PagerDuty:**
1. Check Alertmanager logs: `docker logs cdc-alertmanager`
2. Verify webhook URL/API key is correct in `alertmanager.yml`
3. Test connectivity: `docker exec cdc-alertmanager curl -I https://hooks.slack.com`

**Too many notifications:**
1. Increase `repeat_interval` in `alertmanager.yml`
2. Adjust alert thresholds in `prometheus-alerts.yml`
3. Add more inhibition rules

## Next Steps

- Review the full setup guide: [OBSERVABILITY-SETUP.md](../OBSERVABILITY-SETUP.md)
- Customize alert thresholds in `prometheus-alerts.yml`
- Set up maintenance windows for planned downtime
- Configure mute_time_intervals for recurring maintenance

## Production Considerations

For production deployments, consider:

- Using managed services (Grafana Cloud, Datadog, etc.)
- Setting up high availability for Alertmanager
- Configuring HTTPS/TLS for external access
- Implementing proper secret management
- Setting up authentication on the Alertmanager UI
- Backing up Alertmanager data volume
