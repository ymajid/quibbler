# Build the self-contained mercury.jar (frontend + DevServer) on Windows.
# Needs a JDK 17+ and Node 18+ on PATH — no Maven required. Output: dist\mercury.jar
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command node  -ErrorAction SilentlyContinue)) { throw "Node 18+ is required (https://nodejs.org)" }
if (-not (Get-Command javac -ErrorAction SilentlyContinue)) { throw "A JDK 17+ is required (https://adoptium.net)" }

Write-Host "==> Building frontend"
Push-Location frontend
if (Test-Path package-lock.json) { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
Pop-Location

Write-Host "==> Compiling Java (DevServer path)"
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force build\classes | Out-Null
$dirs = @(
  "java\src\main\java\com\kx",
  "java\src\main\java\com\mercury\kdb",
  "java\src\main\java\com\mercury\config",
  "java\src\main\java\com\mercury\files"
)
$files = @(Get-ChildItem -Recurse -Filter *.java -Path $dirs | ForEach-Object { $_.FullName })
$files += (Resolve-Path "java\src\main\java\com\mercury\DevServer.java").Path
($files | ForEach-Object { '"' + $_ + '"' }) | Set-Content -Encoding ascii build\sources.txt
javac -d build\classes "@build\sources.txt"
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "==> Embedding frontend into the jar"
New-Item -ItemType Directory -Force build\classes\frontend | Out-Null
Copy-Item -Recurse -Force frontend\dist\* build\classes\frontend\

Write-Host "==> Packaging jar"
New-Item -ItemType Directory -Force dist | Out-Null
jar --create --file dist\mercury.jar --main-class com.mercury.DevServer -C build\classes .
if ($LASTEXITCODE -ne 0) { throw "jar failed" }

Write-Host ""
Write-Host "Built dist\mercury.jar"
Write-Host "Run it with:  java -jar dist\mercury.jar"
