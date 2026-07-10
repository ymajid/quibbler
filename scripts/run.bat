@echo off
REM Double-click-friendly wrapper: build (if needed) and run mercury from source.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 pause
