import packageJson from "../../package.json" with { type: "json" };
import toolVersions from "./toolVersions.mjs";

const { tools } = toolVersions;

export default {
  ...packageJson,
  kafka: tools.kafka.version,
  connect: tools.kafkaConnect.version,
  debezium: tools.debezium.version,
  pg: tools.postgres.version
};
