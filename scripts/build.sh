#!/usr/bin/env bash
# Build the self-contained quibbler.jar (frontend + DevServer). Needs a JDK 17+
# and Node 18+ on PATH — no Maven required. Output: dist/quibbler.jar
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v node >/dev/null 2>&1 || { echo "Node 18+ is required — https://nodejs.org"; exit 1; }
# Note: macOS ships stub java/javac that "exist" but error until a JDK is
# installed, so probe that javac actually runs rather than just that it's on PATH.
if ! javac -version >/dev/null 2>&1; then
  echo "A working JDK 17+ was not found."
  echo "  (On macOS, java/javac can be stubs printing 'Unable to locate a Java Runtime'.)"
  echo "  Install one, then run this again:"
  echo "    macOS:          brew install --cask temurin      (or https://adoptium.net)"
  echo "    Windows/Linux:  https://adoptium.net/temurin/releases/?version=17"
  exit 1
fi

echo "==> Building frontend"
(
  cd frontend
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npm run build
)

echo "==> Compiling Java (DevServer path)"
rm -rf build
mkdir -p build/classes
# Only the HTTP-server sources; the JCEF QuibblerApp mode is intentionally excluded.
{ find java/src/main/java/com/kx \
       java/src/main/java/com/quibbler/kdb \
       java/src/main/java/com/quibbler/config \
       java/src/main/java/com/quibbler/files -name '*.java'
  echo java/src/main/java/com/quibbler/DevServer.java
} | sed 's/^.*$/"&"/' > build/sources.txt
javac -encoding UTF-8 -d build/classes "@build/sources.txt"

echo "==> Embedding frontend into the jar"
mkdir -p build/classes/frontend
cp -R frontend/dist/. build/classes/frontend/

echo "==> Packaging jar"
mkdir -p dist
jar --create --file dist/quibbler.jar --main-class com.quibbler.DevServer -C build/classes .

echo ""
echo "Built dist/quibbler.jar"
echo "Run it with:  java -jar dist/quibbler.jar"
