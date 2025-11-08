const packageJson = require("../../package.json");
const toolVersions = require("./toolVersions.cjs");

const { tools } = toolVersions;

module.exports = {
  ...packageJson,
  kafka: tools.kafka.version,
  connect: tools.kafkaConnect.version,
  debezium: tools.debezium.version,
  pg: tools.postgres.version
};
