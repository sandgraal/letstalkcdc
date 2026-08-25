// src/_data/toolVersions.mjs
// Current versions of the CDC tools and platforms referenced on the site.
// Verify each against the vendor's release notes before a refresh — dates
// here are the release dates of the listed version, not "as-of" dates.
// Managed services (Fivetran, Matillion DPC) roll continuously and carry
// no pinned version (status: "saas").

export default {
  lastUpdated: "2026-08-24",
  tools: {
    debezium: {
      version: "3.6.1.Final",
      releaseDate: "2026-08-04",
      releaseNotesUrl: "https://debezium.io/releases/3.6/",
      status: "stable",
    },
    kafka: {
      // Kafka 4.x is KRaft-only — ZooKeeper was removed in 4.0.
      version: "4.3.0",
      releaseDate: "2026-05-22",
      releaseNotesUrl: "https://kafka.apache.org/downloads",
      status: "stable",
    },
    kafkaConnect: {
      version: "4.3.0",
      releaseDate: "2026-05-22",
      releaseNotesUrl: "https://kafka.apache.org/documentation/#connect",
      status: "stable",
    },
    postgres: {
      version: "18.6",
      releaseDate: "2026-08-11",
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
      version: "23ai",
      releaseDate: "2024-05-09",
      releaseNotesUrl:
        "https://docs.oracle.com/en/middleware/goldengate/core/23/",
      status: "stable",
    },
  },
};
