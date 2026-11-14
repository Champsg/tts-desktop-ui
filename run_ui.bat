@echo off
title Kokoro Speech Reader - Desktop UI
echo ======================================================
echo Launching Kokoro Desktop UI for PC...
echo ======================================================

REM Check if Python is available to host a local server
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Starting lightweight local server on http://localhost:5173 ...
    start "" http://localhost:5173/index.html
    python -m http.server 5173 --bind 127.0.0.1
) else (
    echo Python not found in PATH, opening directly in your default browser...
    start "" "%~dp0index.html"
)
pause
