#!/usr/bin/env bash
# Build the self-contained mercury.jar (frontend + DevServer). Needs a JDK 17+
# and Node 18+ on PATH — no Maven required. Output: dist/mercury.jar
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v node  >/dev/null || { echo "Node 18+ is required (https://nodejs.org)"; exit 1; }
command -v javac >/dev/null || { echo "A JDK 17+ is required (https://adoptium.net)"; exit 1; }

echo "==> Building frontend"
(
  cd frontend
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

echo "==> Compiling Java (DevServer path)"
rm -rf build
mkdir -p build/classes
# Only the HTTP-server sources; the JCEF MercuryApp mode is intentionally excluded.
{ find java/src/main/java/com/kx \
       java/src/main/java/com/mercury/kdb \
       java/src/main/java/com/mercury/config \
       java/src/main/java/com/mercury/files -name '*.java'
  echo java/src/main/java/com/mercury/DevServer.java
} | sed 's/^.*$/"&"/' > build/sources.txt
javac -d build/classes "@build/sources.txt"

echo "==> Embedding frontend into the jar"
mkdir -p build/classes/frontend
cp -R frontend/dist/. build/classes/frontend/

echo "==> Packaging jar"
mkdir -p dist
jar --create --file dist/mercury.jar --main-class com.mercury.DevServer -C build/classes .

echo ""
echo "Built dist/mercury.jar"
echo "Run it with:  java -jar dist/mercury.jar"
