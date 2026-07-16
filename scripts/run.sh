#!/usr/bin/env bash
# Build (if needed) and run quibbler from a source checkout.
#   scripts/run.sh            run, building the jar first if it's missing
#   scripts/run.sh --rebuild  force a fresh build
#   scripts/run.sh 9000       run on a specific port
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Fail fast with a clear message if there's no real Java (macOS ships a stub
# that just prints "Unable to locate a Java Runtime").
if ! java -version >/dev/null 2>&1; then
  echo "A working Java 17+ runtime was not found. Install a JDK, then re-run:"
  echo "    macOS:          brew install --cask temurin      (or https://adoptium.net)"
  echo "    Windows/Linux:  https://adoptium.net/temurin/releases/?version=17"
  exit 1
fi

if [ "${1:-}" = "--rebuild" ]; then shift; rm -f dist/quibbler.jar; fi
if [ ! -f dist/quibbler.jar ]; then "$ROOT/scripts/build.sh"; fi

exec java -jar dist/quibbler.jar "$@"
