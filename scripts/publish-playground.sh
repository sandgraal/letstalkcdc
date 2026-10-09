#!/usr/bin/env bash
# Copy the static Change Feed Playground into the built site at /playground/.
# The playground's bundles (playground/assets/generated) are committed, so this
# is a plain copy; the playground-generated-bundles workflow guards that they
# match the source. Run after `npm run build`.
set -euo pipefail

site_dir="${1:-_site}"
rm -rf "$site_dir/playground"
mkdir -p "$site_dir/playground"
cp playground/index.html playground/CDC_logo.png "$site_dir/playground/"
cp -R playground/assets "$site_dir/playground/assets"
touch "$site_dir/.nojekyll"
