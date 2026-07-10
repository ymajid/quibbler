#!/usr/bin/env bash
# Build (if needed) and run mercury from a source checkout.
#   scripts/run.sh            run, building the jar first if it's missing
#   scripts/run.sh --rebuild  force a fresh build
#   scripts/run.sh 9000       run on a specific port
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" = "--rebuild" ]; then shift; rm -f dist/mercury.jar; fi
if [ ! -f dist/mercury.jar ]; then "$ROOT/scripts/build.sh"; fi

exec java -jar dist/mercury.jar "$@"
