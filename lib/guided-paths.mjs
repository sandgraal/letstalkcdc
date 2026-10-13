/**
 * Guided path data (P17-31): validation and resolution.
 *
 * `src/_data/paths.mjs` holds the tracks as plain data; this module checks
 * them against `src/_data/series.mjs` and attaches each step's series key and
 * title. It is shared by the data file (so a bad edit fails the build) and by
 * the unit tests.
 */

/** @typedef {{ href: string, reason: string }} PathStep */
/** @typedef {{ key: string, title: string, audience: string, summary: string, steps: PathStep[] }} PathTrack */

export const REQUIRED_TRACKS = ["newcomer", "operator", "architect"];

const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Return a list of problems with the tracks; an empty list means valid.
 * @param {PathTrack[]} tracks
 * @param {Array<{ key: string, href?: string, state?: string }>} series
 * @returns {string[]}
 */
export function validatePaths(tracks, series) {
  if (!Array.isArray(tracks)) return ["paths must be an array"];
  const problems = [];

  const hrefs = new Set(
    series.filter((s) => s.href && s.state !== "disabled").map((s) => s.href),
  );
  const seenKeys = new Set();

  for (const track of tracks) {
    const id = track?.key ?? "(no key)";
    if (!isText(track?.key)) problems.push("a track has no key");
    else if (seenKeys.has(track.key)) problems.push(`duplicate track ${id}`);
    else seenKeys.add(track.key);

    for (const field of ["title", "audience", "summary"]) {
      if (!isText(track?.[field])) problems.push(`${id}: empty ${field}`);
    }
    if (!Array.isArray(track?.steps)) {
      problems.push(`${id}: steps must be an array`);
      continue;
    }
    const seenHrefs = new Set();
    for (const step of track.steps) {
      const href = step?.href;
      if (!isText(href) || !hrefs.has(href)) {
        problems.push(`${id}: ${href} is not a page in series.mjs`);
        continue;
      }
      if (seenHrefs.has(href)) problems.push(`${id}: duplicate step ${href}`);
      seenHrefs.add(href);
      if (!isText(step.reason)) problems.push(`${id}: ${href} has no reason`);
    }
  }

  for (const required of REQUIRED_TRACKS) {
    if (!seenKeys.has(required)) problems.push(`missing track ${required}`);
  }
  const order = tracks
    .map((t) => t?.key)
    .filter((k) => REQUIRED_TRACKS.includes(k));
  const expected = REQUIRED_TRACKS.filter((k) => order.includes(k));
  if (order.join() !== expected.join()) {
    problems.push(`tracks must be ordered ${REQUIRED_TRACKS.join(", ")}`);
  }
  return problems;
}

/**
 * Throw on any problem, otherwise return the tracks with each step enriched
 * with the series `key` and `title`.
 */
export function resolvePaths(tracks, series) {
  const problems = validatePaths(tracks, series);
  if (problems.length) {
    throw new Error(`Invalid guided path data:\n- ${problems.join("\n- ")}`);
  }
  const byHref = new Map(series.map((s) => [s.href, s]));
  return tracks.map((track) => ({
    ...track,
    steps: track.steps.map((step) => ({
      ...step,
      key: byHref.get(step.href).key,
      title: byHref.get(step.href).title,
    })),
  }));
}
