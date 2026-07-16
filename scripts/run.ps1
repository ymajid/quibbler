# Build (if needed) and run quibbler from a source checkout.
#   scripts\run.ps1            run, building the jar first if it's missing
#   scripts\run.ps1 -Rebuild   force a fresh build
#   scripts\run.ps1 9000       run on a specific port
param([switch]$Rebuild)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Rebuild) { Remove-Item -Force dist\quibbler.jar -ErrorAction SilentlyContinue }
if (-not (Test-Path dist\quibbler.jar)) { & "$PSScriptRoot\build.ps1" }

java -jar dist\quibbler.jar @args
