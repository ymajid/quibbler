# Produce a self-contained Windows app image (bundles a Java runtime - the user
# needs nothing installed). Requires jpackage from a JDK 17+ and a prior build.
#   scripts\build.ps1
#   scripts\package-windows.ps1 -Version 0.1.0
# Output: dist\win\quibbler\  (double-click quibbler.exe) - zip that folder to ship.
param([string]$Version = "0.1.0")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# jpackage rejects a version whose first component is 0 on some platforms; the
# bundle's internal version is cosmetic, so bump a leading 0 major to 1.
$jpkgVer = $Version
if ($jpkgVer -like '0.*') { $jpkgVer = '1.' + $jpkgVer.Substring(2) }
elseif ($jpkgVer -eq '0') { $jpkgVer = '1.0.0' }

if (-not (Get-Command jpackage -ErrorAction SilentlyContinue)) { throw "jpackage not found - install a JDK 17+ (https://adoptium.net)" }
if (-not (Test-Path dist\quibbler.jar)) { throw "dist\quibbler.jar not found - run scripts\build.ps1 first" }

# NB: don't name this $input - that's a reserved PowerShell automatic variable.
$inputDir = "build\jpackage-input"
Remove-Item -Recurse -Force $inputDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $inputDir | Out-Null
Copy-Item dist\quibbler.jar "$inputDir\quibbler.jar"

$out = "dist\win"
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

Write-Host "==> Running jpackage (app-image, bundled runtime)"
jpackage `
  --type app-image `
  --name quibbler `
  --app-version $jpkgVer `
  --input $inputDir `
  --main-jar quibbler.jar `
  --main-class com.quibbler.DevServer `
  --dest $out `
  --win-console `
  --java-options "-Xmx1g"
if ($LASTEXITCODE -ne 0) { throw "jpackage failed" }

Write-Host ""
Write-Host "Built $out\quibbler  (double-click quibbler.exe - no Java install needed)"
