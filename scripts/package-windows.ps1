# Produce a self-contained Windows app image (bundles a Java runtime — the user
# needs nothing installed). Requires jpackage from a JDK 17+ and a prior build.
#   scripts\build.ps1
#   scripts\package-windows.ps1 -Version 0.1.0
# Output: dist\win\mercury\  (double-click mercury.exe) — zip that folder to ship.
param([string]$Version = "0.1.0")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command jpackage -ErrorAction SilentlyContinue)) { throw "jpackage not found — install a JDK 17+ (https://adoptium.net)" }
if (-not (Test-Path dist\mercury.jar)) { throw "dist\mercury.jar not found — run scripts\build.ps1 first" }

$input = "build\jpackage-input"
Remove-Item -Recurse -Force $input -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $input | Out-Null
Copy-Item dist\mercury.jar "$input\mercury.jar"

$out = "dist\win"
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

Write-Host "==> Running jpackage (app-image, bundled runtime)"
jpackage `
  --type app-image `
  --name mercury `
  --app-version $Version `
  --input $input `
  --main-jar mercury.jar `
  --main-class com.mercury.DevServer `
  --dest $out `
  --win-console `
  --java-options "-Xmx1g"
if ($LASTEXITCODE -ne 0) { throw "jpackage failed" }

Write-Host ""
Write-Host "Built $out\mercury  (double-click mercury.exe — no Java install needed)"
