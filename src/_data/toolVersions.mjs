// src/_data/toolVersions.mjs
// Two different kinds of version data live here. Do not mix them up.
//
//   tools   = the LATEST STABLE release of each product, with its release
//             date, taken from the vendor's own page (Maven Central, the
//             Apache Kafka downloads page, postgresql.org, the AWS DMS and
//             Oracle GoldenGate release notes). It says what exists, not what
//             this site's labs run.
//   tested  = what the repo's lab configs actually pin (the root compose.yaml
//             and the compose file printed on /lab-kafka-debezium/).
//             tests/unit/tool-versions.test.js fails if these drift from the
//             compose files, so a "tested with" note can only name a version
//             a config really uses.
//
// lastUpdated is the date `tools` was last checked against those primary
// sources (not a release date). Managed services (Fivetran, Matillion DPC)
// roll continuously and carry no pinned version (status: "saas").

export default {
  lastUpdated: "2026-10-09",
  tested: {
    // Image tag on confluentinc/cp-kafka. Confluent Platform 7.7.x ships
    // Apache Kafka 3.7.x (docs.confluent.io, versions-interoperability).
    confluentPlatform: "7.7.0",
    apacheKafka: "3.7",
    // Docker Hub tag on debezium/connect: a release series, not a patch.
    debeziumConnect: "2.7",
    // Major version of the debezium/postgres image in the lab compose file.
    postgresMajor: "15",
  },
  tools: {
    debezium: {
      version: "3.7.0.Final",
      releaseDate: "2026-09-29",
      releaseNotesUrl: "https://debezium.io/releases/3.7/",
      status: "stable",
    },
    kafka: {
      // Kafka 4.x is KRaft-only — ZooKeeper was removed in 4.0.
      version: "4.3.1",
      releaseDate: "2026-06-25",
      releaseNotesUrl: "https://kafka.apache.org/downloads",
      status: "stable",
    },
    kafkaConnect: {
      version: "4.3.1",
      releaseDate: "2026-06-25",
      releaseNotesUrl: "https://kafka.apache.org/documentation/#connect",
      status: "stable",
    },
    postgres: {
      version: "18.6",
      releaseDate: "2026-08-13",
      releaseNotesUrl: "https://www.postgresql.org/docs/release/18.6/",
      status: "stable",
    },
    matillion: {
      version: "N/A",
      releaseDate: "N/A",
      releaseNotesUrl:
        "https://docs.matillion.com/metl/docs/release-notes-index/",
      status: "saas",
    },
    awsDms: {
      version: "3.6.1",
      releaseDate: "2025-05-15",
      releaseNotesUrl:
        "https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReleaseNotes.html",
      status: "stable",
    },
    fivetran: {
      version: "N/A",
      releaseDate: "N/A",
      releaseNotesUrl: "https://fivetran.com/docs/changelog",
      status: "saas",
    },
    goldenGate: {
      // Oracle moved the docs from /en/middleware/ (23ai) to /en/database/
      // (26ai). The 26ai release date is not stated on the docs pages, so it
      // is left unverified rather than guessed.
      version: "26ai",
      releaseDate: "unverified",
      releaseNotesUrl:
        "https://docs.oracle.com/en/database/goldengate/core/26/release-notes/",
      status: "stable",
    },
  },
};
