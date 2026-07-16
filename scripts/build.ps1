# Build the self-contained quibbler.jar (frontend + DevServer) on Windows.
# Needs a JDK 17+ and Node 18+ on PATH - no Maven required. Output: dist\quibbler.jar
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
  "java\src\main\java\com\quibbler\kdb",
  "java\src\main\java\com\quibbler\config",
  "java\src\main\java\com\quibbler\files"
)
$files = @(Get-ChildItem -Recurse -Filter *.java -Path $dirs | ForEach-Object { $_.FullName })
$files += (Resolve-Path "java\src\main\java\com\quibbler\DevServer.java").Path
# Pass the files directly (splat), NOT via a javac @argfile: an @argfile treats
# backslashes as escape characters, which mangles Windows absolute paths
# (D:\a\... -> D:a...). PowerShell splatting quotes each path correctly.
javac -encoding UTF-8 -d build\classes @files
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "==> Embedding frontend into the jar"
New-Item -ItemType Directory -Force build\classes\frontend | Out-Null
Copy-Item -Recurse -Force frontend\dist\* build\classes\frontend\

Write-Host "==> Packaging jar"
New-Item -ItemType Directory -Force dist | Out-Null
jar --create --file dist\quibbler.jar --main-class com.quibbler.DevServer -C build\classes .
if ($LASTEXITCODE -ne 0) { throw "jar failed" }

Write-Host ""
Write-Host "Built dist\quibbler.jar"
Write-Host "Run it with:  java -jar dist\quibbler.jar"
