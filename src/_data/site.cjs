const normalizeHost = (host) => {
  if (!host) {
    return null;
  }

  return host.replace(/\/$/, "");
};

const defaultHost = "https://letstalkcdc.github.io";

module.exports = {
  title: "CDC: The Missing Manual",
  tagline: "A Deep Dive into Change Data Capture",
  seoTitle: "CDC: The Missing Manual | A Deep Dive into Change Data Capture",
  description: "Learn why Change Data Capture (CDC) projects fail and how to build scalable, reliable, and production-ready data pipelines.",
  host: normalizeHost(process.env.SITE_HOST) || defaultHost,
  author: "Christopher Ennis",
  copyright: "© 2025 Christopher Ennis. A deep dive into the world of Change Data Capture."
};
