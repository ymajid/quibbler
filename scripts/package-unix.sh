#!/usr/bin/env bash
# Produce a self-contained app image for the CURRENT OS (macOS .app or Linux
# dir), bundling a Java runtime so the user needs nothing installed. Requires
# jpackage (JDK 17+) and a prior build.
#   scripts/build.sh
#   scripts/package-unix.sh 0.1.0
# Output: dist/app/  (macOS: quibbler.app · Linux: quibbler/ with bin/quibbler)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-0.1.0}"
# jpackage (notably the macOS bundler) rejects a version whose first component is
# 0. The bundle's internal version is cosmetic, so bump a leading 0 major to 1.
JPKG_VER="$VERSION"
case "$JPKG_VER" in
  0.*) JPKG_VER="1.${JPKG_VER#0.}" ;;
  0)   JPKG_VER="1.0.0" ;;
esac

command -v jpackage >/dev/null || { echo "jpackage not found — install a JDK 17+ (https://adoptium.net)"; exit 1; }
[ -f dist/quibbler.jar ] || { echo "dist/quibbler.jar not found — run scripts/build.sh first"; exit 1; }

IN=build/jpackage-input
rm -rf "$IN"; mkdir -p "$IN"
cp dist/quibbler.jar "$IN/quibbler.jar"

OUT=dist/app
rm -rf "$OUT"; mkdir -p "$OUT"

echo "==> Running jpackage (app-image, bundled runtime)"
jpackage \
  --type app-image \
  --name quibbler \
  --app-version "$JPKG_VER" \
  --input "$IN" \
  --main-jar quibbler.jar \
  --main-class com.quibbler.DevServer \
  --dest "$OUT" \
  --java-options "-Xmx1g"

echo ""
echo "Built app image in $OUT:"
ls "$OUT"
