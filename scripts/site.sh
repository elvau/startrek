#!/bin/sh
# Seite zusammenstellen: Daten und Rechtliches aus public/, darüber die gebaute App aus app/dist/.
# Gleich für die Testumgebung (GitHub Pages) und splitandfly.com (Firebase Hosting).
set -e
out="${1:?Zielordner fehlt}"
rm -rf "$out"
mkdir -p "$out"
cp -r public/. "$out/"
cp -r app/dist/. "$out/"
