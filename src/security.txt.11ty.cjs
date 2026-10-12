/**
 * /.well-known/security.txt (RFC 9116, P17-29).
 *
 * Built from a template, not copied from src/static, because `Canonical` must
 * be `site.host` plus the file's own path (so it follows the domain move) and
 * the contact address has one source of truth, src/_data/author.mjs. No host
 * is written in this file.
 *
 * `Expires` is fixed on purpose: RFC 9116 wants a person to re-confirm the file
 * at least yearly. tests/unit/security-txt.test.js fails once the date has
 * passed, or if it is set more than 400 days ahead. To renew: move EXPIRES
 * about a year forward (never more than a year) in the same change that
 * re-checks the contact address.
 *
 * Under the project site this file is served below the path prefix
 * (/letstalkcdc/.well-known/security.txt), not at the host root where RFC 9116
 * looks first. That limit lifts with the domain move (docs/DECISIONS.md).
 */
const EXPIRES = "2027-10-12T00:00:00.000Z";

module.exports = class {
  data() {
    return {
      permalink: "/.well-known/security.txt",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ site, author }) {
    const base = (site?.host || "").replace(/\/$/, "");
    return (
      [
        "# Security contact for the Let's Talk CDC site (static pages and an",
        "# optional feedback database). See the policy links below.",
        `Contact: mailto:${author?.contactEmail}`,
        `Expires: ${EXPIRES}`,
        "Preferred-Languages: en",
        `Canonical: ${base}/.well-known/security.txt`,
        `Policy: https://github.com/${site?.repository}/blob/main/SECURITY.md`,
        `Policy: ${base}/contact/#security`,
      ].join("\n") + "\n"
    );
  }
};
