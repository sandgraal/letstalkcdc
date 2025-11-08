# CDC Sandbox Environment

A complete Docker Compose-based CDC (Change Data Capture) sandbox for hands-on practice. This environment includes everything needed to learn and experiment with CDC patterns: source databases, Kafka, Debezium connectors, and monitoring tools.

## 🎯 What's Included

The sandbox provides a fully integrated CDC stack:

- **Source Databases**:
  - **PostgreSQL 14** with sample inventory data (products, customers, orders)
  - **MySQL 8** with sample inventory data (same schema for comparison)
- **Streaming Platform**:
  - **Apache Kafka** for event streaming
  - **Zookeeper** for Kafka coordination
- **CDC Connectors**:
  - **Debezium Connect** with Postgres and MySQL connectors pre-installed
- **Monitoring & Tools**:
  - **Kafka UI** - Web interface for browsing topics, messages, and connectors
  - **kcat** (formerly kafkacat) - CLI tool for producing/consuming messages

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB of RAM available for Docker
- Ports 3306, 5432, 8080, 8083, 9092, 2181 available

### Start the Sandbox

```bash
# From the repository root
docker compose up -d

# Check that all services are running
docker compose ps
```

All services should show "Up" status. Initial startup takes 30-60 seconds.

### Verify Services

```bash
# Check Kafka Connect is ready
curl http://localhost:8083/

# Check Postgres has data
docker compose exec postgres psql -U postgres -d inventory -c "SELECT COUNT(*) FROM products;"

# Check MySQL has data
docker compose exec mysql mysql -u debezium -pdbz -e "SELECT COUNT(*) FROM inventory.products;"

# Open Kafka UI in your browser
open http://localhost:8080
```

## 📚 Using the Sandbox

### Register a Postgres CDC Connector

```bash
# Register the connector
./sandbox/register-postgres-connector.sh

# Verify connector is running
curl http://localhost:8083/connectors/postgres-inventory-connector/status | jq

# Generate a change event
docker compose exec postgres psql -U postgres -d inventory -c \
  "UPDATE products SET weight = 3.0 WHERE id = 1;"

# View the change event in Kafka UI
# Navigate to http://localhost:8080 → Topics → dbserver1.public.products
```

### Register a MySQL CDC Connector

```bash
# Register the connector
./sandbox/register-mysql-connector.sh

# Verify connector is running
curl http://localhost:8083/connectors/mysql-inventory-connector/status | jq

# Generate a change event
docker compose exec mysql mysql -u debezium -pdbz inventory -e \
  "UPDATE products SET weight = 2.8 WHERE id = 1;"

# View the change event in Kafka UI
# Navigate to http://localhost:8080 → Topics → mysql-server1.inventory.products
```

### Consume Messages with kcat

```bash
# List all topics
docker compose exec kcat kcat -b kafka:29092 -L

# Consume from Postgres products topic
docker compose exec kcat kcat -b kafka:29092 -C \
  -t dbserver1.public.products -f '\nKey: %k\nValue: %s\n'

# Consume from MySQL products topic
docker compose exec kcat kcat -b kafka:29092 -C \
  -t mysql-server1.inventory.products -f '\nKey: %k\nValue: %s\n'
```

### Access Database Directly

**PostgreSQL:**
```bash
# Connect to psql
docker compose exec postgres psql -U postgres -d inventory

# Run queries
SELECT * FROM products;
SELECT * FROM customers LIMIT 5;
```

**MySQL:**
```bash
# Connect to mysql
docker compose exec mysql mysql -u debezium -pdbz inventory

# Run queries
SELECT * FROM products;
SELECT * FROM customers LIMIT 5;
```

## 🧪 Sample Data

Both databases are initialized with the same sample data:

- **5 products** (Laptop, Mouse, Keyboard, Monitor, Headphones)
- **5 customers** (John Doe, Jane Smith, Bob Johnson, Alice Williams, Charlie Brown)
- **5 orders** with various statuses (pending, completed, shipped)
- **6 order items** linking orders to products

## 🔌 Service Endpoints

| Service | Endpoint | Credentials |
|---------|----------|-------------|
| **Kafka UI** | http://localhost:8080 | None |
| **Kafka Connect API** | http://localhost:8083 | None |
| **PostgreSQL** | localhost:5432 | User: `postgres`, Password: `postgres`, DB: `inventory` |
| **MySQL** | localhost:3306 | User: `debezium`, Password: `dbz`, DB: `inventory` |
| **Kafka Broker** | localhost:9092 (external)<br>kafka:29092 (internal) | None |

## 🎓 Learning Scenarios

### Scenario 1: Basic CDC Flow
1. Register the Postgres connector
2. Make an UPDATE to a product
3. View the change event in Kafka UI
4. Observe the event structure (before/after, op, timestamp)

### Scenario 2: Compare Postgres vs MySQL CDC
1. Register both connectors
2. Make the same UPDATE to the same product ID in both databases
3. Compare the event structures in Kafka UI
4. Notice differences in metadata, timestamp formats, etc.

### Scenario 3: Schema Evolution
1. Add a new column to a table
2. Insert a row with the new column populated
3. Observe how Debezium handles the schema change
4. Check the schema registry topic in Kafka UI

### Scenario 4: DELETE Operations
1. Delete a row from a table
2. Observe the DELETE event in Kafka
3. Notice the tombstone event that follows
4. Understand how downstream systems should handle deletes

### Scenario 5: Snapshot Mode
1. Stop and remove a connector
2. Insert several rows into the source table
3. Re-register the connector
4. Observe the snapshot process capturing existing data

## 🔧 Troubleshooting

### Services won't start
```bash
# Check logs for specific service
docker compose logs kafka
docker compose logs connect
docker compose logs postgres

# Restart all services
docker compose restart
```

### Connector fails to register
```bash
# Check Connect logs
docker compose logs connect

# Verify Connect is ready
curl http://localhost:8083/connector-plugins | jq

# Delete and re-register connector
curl -X DELETE http://localhost:8083/connectors/postgres-inventory-connector
./sandbox/register-postgres-connector.sh
```

### No events appearing in Kafka
```bash
# Verify connector is running
curl http://localhost:8083/connectors/postgres-inventory-connector/status | jq

# Check connector tasks
curl http://localhost:8083/connectors/postgres-inventory-connector/tasks | jq

# Verify table is in whitelist
curl http://localhost:8083/connectors/postgres-inventory-connector | jq .config

# Check database replication settings
docker compose exec postgres psql -U postgres -d inventory -c "SHOW wal_level;"
```

### Kafka UI shows no topics
```bash
# Wait for Kafka to fully start (can take 30-60 seconds)
docker compose logs kafka

# Verify Kafka is accessible
docker compose exec kcat kcat -b kafka:29092 -L
```

## 🧹 Cleanup

```bash
# Stop all services
docker compose down

# Remove all data volumes (fresh start)
docker compose down -v

# Remove all containers, volumes, and networks
docker compose down -v --remove-orphans
```

## 📖 Next Steps

Once you're comfortable with the sandbox, explore:

1. **[Lab: CDC with Kafka and Debezium](/lab-kafka-debezium/)** - Complete end-to-end lab including sinks
2. **[Quickstart Guides](/quickstarts/)** - Database-specific CDC configurations
3. **[Schema Evolution](/schema-evolution/)** - Handle schema changes in production
4. **[Materialization Patterns](/materialization/)** - Strategies for applying CDC events
5. **[Observability](/observability/)** - Monitor your CDC pipelines

## 🔒 Security Note

**⚠️ This sandbox uses hardcoded credentials for ease of learning. Never use these credentials in production!**

For production deployments:
- Use strong, unique passwords
- Store credentials in environment variables or secrets management systems
- Enable TLS/SSL for all connections
- Implement proper authentication and authorization
- Regularly rotate credentials
- Follow the principle of least privilege

## 🤝 Contributing

Found an issue or have an improvement idea? Please open an issue or pull request!

## 📝 License

This sandbox configuration is part of the Let's Talk CDC project and follows the same license.
