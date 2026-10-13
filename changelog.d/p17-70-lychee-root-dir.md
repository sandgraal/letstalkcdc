type: Fixed

**Link check works with newer lychee (P17-70).** lychee 0.2x (the version in
lychee-action 2.9.0) fails every root-relative link in the built HTML, such as
`/letstalkcdc/assets/css/pages/not-found.css`, with "Cannot resolve
root-relative link ... provide a root dir". `linkcheck.yml` now passes
`--root-dir <workspace>/_site` and a first `--remap` that strips the public
path prefix from the resolved `file://` URL, so `/letstalkcdc/x` lands on
`_site/x`. No exclusion or `--accept` flag changed.
