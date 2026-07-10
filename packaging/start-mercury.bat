@echo off
REM mercury launcher — double-click to start. Needs Java 17+ installed.
setlocal
cd /d "%~dp0"

where java >nul 2>nul
if errorlevel 1 goto :nojava

echo Starting mercury... a browser window will open.
echo (Close this window or press Ctrl+C to stop.)
echo.
java -jar mercury.jar %*
echo.
echo mercury has stopped.
pause
exit /b 0

:nojava
echo ============================================================
echo   Java was not found.
echo.
echo   mercury needs Java 17 or newer. Download it (free) from:
echo     https://adoptium.net/temurin/releases/?version=17
echo.
echo   Install it, then double-click start-mercury.bat again.
echo.
echo   (Or download the "mercury-win" version, which needs no Java.)
echo ============================================================
pause
exit /b 1
