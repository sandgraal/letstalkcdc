type: Fixed

**Link check works with newer lychee (P17-70).** `lycheeverse/lychee-action`
is bumped from 2.0.2 to 2.9.0 together with the fix it needs, because the two
cannot land separately. lychee 0.2x (the version in lychee-action 2.9.0) fails
every root-relative link in the built HTML, such as
`/letstalkcdc/assets/css/pages/not-found.css`, with "Cannot resolve
root-relative link ... provide a root dir", while the previously pinned lychee
0.16 rejects `--root-dir` as an unknown argument. `linkcheck.yml` now passes
`--root-dir <workspace>/_site` and a first `--remap` that strips the public
path prefix from the resolved `file://` URL, so `/letstalkcdc/x` lands on
`_site/x`. A remap placed before it sends the bare prefix `/letstalkcdc`
(no trailing slash) to the site root `_site/`. No exclusion or `--accept` flag changed.
