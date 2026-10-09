import packageJson from "../../package.json" with { type: "json" };
import toolVersions from "./toolVersions.mjs";

// These feed the "Tested with" note on /lab-kafka-debezium/, so they come from
// `tested` (what the lab compose files pin), not from `tools` (latest release).
const { tested } = toolVersions;

export default {
  ...packageJson,
  confluentPlatform: tested.confluentPlatform,
  kafka: tested.apacheKafka,
  debeziumConnect: tested.debeziumConnect,
  pgMajor: tested.postgresMajor,
};
