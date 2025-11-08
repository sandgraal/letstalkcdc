# CDC Sandbox Environment - Complete Guide

The Let's Talk CDC project includes a pre-configured Docker Compose sandbox that provides everything you need for hands-on CDC practice. This guide covers setup, usage, and integration with the learning materials.

## Overview

The sandbox eliminates setup friction by providing a complete CDC stack that works out of the box. It's designed for learners who want to experiment with real CDC scenarios without spending hours on configuration.

### What Makes This Sandbox Special?

- **🚀 Zero Configuration** - Works immediately with `docker compose up`
- **🎓 Learning-Focused** - Pre-loaded with sample data for immediate experimentation
- **🔄 Multi-Database** - Compare Postgres and MySQL CDC side-by-side
- **👁️ Visual Tools** - Kafka UI included for easy message inspection
- **📚 Integrated** - Designed to work with all lab exercises and quickstarts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CDC Sandbox Stack                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐    │
│  │PostgreSQL│─────────│          │─────────│          │    │
│  │  :5432   │   CDC   │  Kafka   │ Events  │ Kafka UI │    │
│  └──────────┘         │  :9092   │         │  :8080   │    │
│                       │          │         │          │    │
│  ┌──────────┐         │          │         └──────────┘    │
│  │  MySQL   │─────────│          │                          │
│  │  :3306   │   CDC   │          │         ┌──────────┐    │
│  └──────────┘         └────┬─────┘         │  kcat    │    │
│                            │               │  (CLI)   │    │
│                       ┌────┴─────┐         └──────────┘    │
│                       │ Debezium │                          │
│                       │ Connect  │                          │
│                       │  :8083   │                          │
│                       └──────────┘                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Step 1: Start the Sandbox

```bash
# From the repository root
docker compose up -d

# Verify all services are running
docker compose ps
```

Expected output:
```
NAME                    STATUS              PORTS
letstalkcdc-connect     Up                  0.0.0.0:8083->8083/tcp
letstalkcdc-kafka       Up                  0.0.0.0:9092->9092/tcp, 0.0.0.0:29092->29092/tcp
letstalkcdc-kafka-ui    Up                  0.0.0.0:8080->8080/tcp
letstalkcdc-mysql       Up                  0.0.0.0:3306->3306/tcp
letstalkcdc-postgres    Up                  0.0.0.0:5432->5432/tcp
letstalkcdc-zookeeper   Up                  0.0.0.0:2181->2181/tcp
```

### Step 2: Verify Sample Data

```bash
# Check Postgres
docker compose exec postgres psql -U postgres -d inventory -c \
  "SELECT COUNT(*) FROM products;"

# Check MySQL
docker compose exec mysql mysql -u debezium -pdbz -e \
  "SELECT COUNT(*) FROM inventory.products;"
```

Both should return 5 products.

### Step 3: Register a CDC Connector

Choose either Postgres or MySQL (or register both!):

```bash
# Postgres
./sandbox/register-postgres-connector.sh

# MySQL
./sandbox/register-mysql-connector.sh
```

### Step 4: Generate and Observe Change Events

```bash
# Make a change to the database
docker compose exec postgres psql -U postgres -d inventory -c \
  "UPDATE products SET weight = 3.5 WHERE name = 'Laptop';"

# Open Kafka UI to see the event
{% include "snippets/open-url.njk" with { url: "http://localhost:8080" } %}
# Navigate to: Topics → dbserver1.public.products → Messages
```

## Integration with Learning Materials

### Using the Sandbox with Lab Exercises

The sandbox is designed to work seamlessly with all lab exercises. When you see instructions like "set up Postgres with CDC enabled," you can skip those steps and use the sandbox instead.

#### Example: Lab - CDC with Kafka and Debezium

Original instructions say:
> Create a docker-compose.yml with Postgres, Kafka, and Debezium...

**With the sandbox:**
1. ✅ Already done! Just run `docker compose up -d`
2. ✅ Sample data already loaded
3. ✅ Skip to connector registration: `./sandbox/register-postgres-connector.sh`
4. 🎯 Focus on learning CDC concepts instead of setup

### Using the Sandbox with Quickstart Guides

Each quickstart guide includes database-specific configuration. The sandbox provides pre-configured databases, so you can focus on understanding the connector settings.

#### Example: MySQL Quickstart

The quickstart shows:
```sql
-- Enable binlog
SET binlog_format = 'ROW';
```

**With the sandbox:**
- ✅ Binlog already configured correctly
- ✅ User with replication privileges already created
- ✅ Sample database already initialized
- 🎯 Jump straight to connector registration

### Mapping Sandbox Services to Lab Instructions

When lab instructions reference specific services, use these sandbox endpoints:

| Lab Instruction | Sandbox Equivalent |
|----------------|-------------------|
| "Connect to your Postgres database" | `docker compose exec postgres psql -U postgres -d inventory` |
| "Kafka broker at localhost:9092" | ✅ Already configured |
| "Post connector config to Connect API" | `./sandbox/register-postgres-connector.sh` |
| "View Kafka messages" | Open http://localhost:8080 |
| "Use kafkacat/kcat" | `docker compose exec kcat kcat -b kafka:29092 ...` |

## Advanced Usage

### Custom Connector Configurations

Create your own connector configuration:

```bash
# Copy an example
cp sandbox/connectors/postgres-connector.json my-connector.json

# Edit the configuration
vim my-connector.json

# Register with custom config
curl -X POST -H "Content-Type: application/json" \
  --data @my-connector.json \
  http://localhost:8083/connectors/
```

### Add More Tables

```bash
# Add a new table to Postgres
docker compose exec postgres psql -U postgres -d inventory -c "
CREATE TABLE shipments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  shipped_date TIMESTAMP,
  tracking_number VARCHAR(100)
);"

# Connector will automatically start capturing changes
# (if table pattern includes it)
```

### Monitor with Kafka Connect API

```bash
# List all connectors
curl http://localhost:8083/connectors/ | jq

# Get connector status
curl http://localhost:8083/connectors/postgres-inventory-connector/status | jq

# Get connector configuration
curl http://localhost:8083/connectors/postgres-inventory-connector/config | jq

# Pause a connector
curl -X PUT http://localhost:8083/connectors/postgres-inventory-connector/pause

# Resume a connector
curl -X PUT http://localhost:8083/connectors/postgres-inventory-connector/resume

# Delete a connector
curl -X DELETE http://localhost:8083/connectors/postgres-inventory-connector
```

## Database Schemas

Both databases have identical schemas for comparison:

### Tables

- **products** - Product catalog (id, name, description, weight, created_at)
- **customers** - Customer records (id, first_name, last_name, email, created_at)
- **orders** - Order headers (id, order_date, customer_id, status, total_amount)
- **order_items** - Order line items (id, order_id, product_id, quantity, price)

### Sample Data

- 5 products (Laptop, Mouse, Keyboard, Monitor, Headphones)
- 5 customers
- 5 orders (various statuses)
- 6 order items

### Generating More Sample Data

```bash
# Postgres: Add a new customer
docker compose exec postgres psql -U postgres -d inventory -c "
INSERT INTO customers (first_name, last_name, email)
VALUES ('Sarah', 'Connor', 'sarah.connor@example.com');"

# MySQL: Add a new product
docker compose exec mysql mysql -u debezium -pdbz inventory -e "
INSERT INTO products (name, description, weight)
VALUES ('Webcam', 'HD 1080p webcam', 0.2);"
```

## Troubleshooting

### Port Conflicts

If ports are already in use on your machine:

```bash
# Check which ports are in use
lsof -i :5432
lsof -i :3306
lsof -i :8080
lsof -i :8083
lsof -i :9092

# Option 1: Stop conflicting services
# Option 2: Edit compose.yaml to use different ports
```

### Connector Registration Fails

```bash
# Wait for Connect to fully start (takes ~30 seconds)
sleep 30

# Check Connect logs
docker compose logs connect

# Verify Connect has required plugins
curl http://localhost:8083/connector-plugins | jq
```

### Changes Not Appearing in Kafka

```bash
# Verify connector is running
curl http://localhost:8083/connectors/postgres-inventory-connector/status | jq

# Check if table is included in connector config
curl http://localhost:8083/connectors/postgres-inventory-connector/config | \
  jq .table.include.list

# Check Postgres WAL settings
docker compose exec postgres psql -U postgres -d inventory -c \
  "SELECT name, setting FROM pg_settings WHERE name IN ('wal_level', 'max_wal_senders', 'max_replication_slots');"
```

### Reset Everything

```bash
# Stop and remove all containers and volumes
docker compose down -v

# Start fresh
docker compose up -d

# Re-register connectors
./sandbox/register-postgres-connector.sh
./sandbox/register-mysql-connector.sh
```

## Performance Considerations

The sandbox is optimized for learning, not production performance:

- Single-node Kafka (no replication)
- Minimal resource limits
- Synchronous commits enabled
- All services on one host

For production scenarios, refer to the [deployment guides](/docs/HOSTING.md).

## What's Next?

Now that you have a working CDC sandbox:

1. **[Complete the Kafka + Debezium Lab](/lab-kafka-debezium/)** - End-to-end CDC pipeline with sinks
2. **[Try the Quickstart Guides](/quickstarts/)** - Database-specific CDC patterns
3. **[Learn Schema Evolution](/schema-evolution/)** - Handle schema changes gracefully
4. **[Explore Materialization](/materialization/)** - Apply CDC events to targets
5. **[Add Observability](/observability/)** - Monitor your CDC pipelines

## Security Reminders

⚠️ **The sandbox uses default credentials for simplicity. Never use these in production!**

Production checklist:
- [ ] Use strong, unique passwords
- [ ] Store credentials in secrets management (Vault, AWS Secrets Manager, etc.)
- [ ] Enable TLS/SSL for all connections
- [ ] Implement network segmentation
- [ ] Enable authentication for Kafka and Connect
- [ ] Regular security audits
- [ ] Credential rotation policy

## Contributing

Found an issue or have an improvement idea?

- 📝 [Open an issue](https://github.com/sandgraal/letstalkcdc/issues)
- 🔧 [Submit a pull request](https://github.com/sandgraal/letstalkcdc/pulls)
- 💬 [Join the discussion](https://github.com/sandgraal/letstalkcdc/discussions)

---

**Next:** [Sandbox Quick Reference](../sandbox/README.md) | [Back to Setup Guide](SETUP.md)
