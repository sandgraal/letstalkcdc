#!/usr/bin/env bash
# Copy the static Change Feed Playground into the built site at /playground/.
# The playground's bundles (playground/assets/generated) are committed, so this
# is a plain copy; the playground-generated-bundles workflow guards that they
# match the source. Run after `npm run build`.
#
# index.html is not a plain copy: the canonical and Open Graph URLs in its
# <head> carry a __SITE_URL__ placeholder, replaced here from SITE_HOST and
# ELEVENTY_PATH_PREFIX (the variables the Eleventy build reads). Set them the
# same way as for `npm run build`.
set -euo pipefail

site_dir="${1:-_site}"
rm -rf "$site_dir/playground"
mkdir -p "$site_dir/playground"
node scripts/render-playground-html.mjs playground/index.html "$site_dir/playground/index.html"
cp playground/CDC_logo.png "$site_dir/playground/"
cp -R playground/assets "$site_dir/playground/assets"
touch "$site_dir/.nojekyll"
