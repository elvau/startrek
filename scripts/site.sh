#!/bin/sh
# Seite zusammenstellen: Daten und Rechtliches aus public/, darüber die gebaute App aus app/dist/.
# Gleich für die Testumgebung (GitHub Pages) und splitandfly.com (Firebase Hosting).
# Zweites Argument „test“: Testumgebung, für Suchmaschinen gesperrt (noindex in jeder Seite, weil Google eine
# robots.txt unter /startrek/ nicht beachtet) und ohne Sitemap.
set -e
out="${1:?Zielordner fehlt}"
rm -rf "$out"
mkdir -p "$out"
cp -r public/. "$out/"
cp -r app/dist/. "$out/"
if [ "$2" = "test" ]; then
  printf 'User-agent: *\nDisallow: /\n' > "$out/robots.txt"
  rm -f "$out/sitemap.xml"
  for f in "$out"/*.html; do
    grep -q 'name="robots"' "$f" || sed -i 's#<head>#<head><meta name="robots" content="noindex">#' "$f"
  done
fi
