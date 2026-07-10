#!/usr/bin/env bash
# mercury launcher for macOS / Linux. Needs Java 17+ installed.
cd "$(dirname "$0")"
if ! command -v java >/dev/null 2>&1; then
  echo "Java 17+ is required. Get it (free) from:"
  echo "  https://adoptium.net/temurin/releases/?version=17"
  exit 1
fi
exec java -jar mercury.jar "$@"
