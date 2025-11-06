// src/_data/toolVersions.cjs
// Tracks current versions of CDC tools and platforms
// Updated by site-content-review agent quarterly

module.exports = {
  lastUpdated: "2025-11-06",
  tools: {
    debezium: {
      version: "2.7.0",
      releaseDate: "2024-07-15",
      releaseNotesUrl: "https://debezium.io/releases/2.7/",
      status: "stable"
    },
    kafka: {
      version: "3.8.0",
      releaseDate: "2024-09-17",
      releaseNotesUrl: "https://kafka.apache.org/downloads",
      status: "stable"
    },
    kafkaConnect: {
      version: "3.8.0",
      releaseDate: "2024-09-17",
      releaseNotesUrl: "https://kafka.apache.org/documentation/#connect",
      status: "stable"
    },
    matillion: {
      version: "1.71",
      releaseDate: "2024-09-01",
      releaseNotesUrl: "https://www.matillion.com/resources/release-notes",
      status: "stable"
    },
    awsDms: {
      version: "3.5.3",
      releaseDate: "2024-08-01",
      releaseNotesUrl: "https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReleaseNotes.html",
      status: "stable"
    },
    fivetran: {
      version: "N/A",
      releaseDate: "N/A",
      releaseNotesUrl: "https://fivetran.com/docs/getting-started/changelog",
      status: "saas"
    },
    goldenGate: {
      version: "23.4",
      releaseDate: "2024-10-01",
      releaseNotesUrl: "https://docs.oracle.com/en/middleware/goldengate/core/23/release-notes/",
      status: "stable"
    }
  }
};
