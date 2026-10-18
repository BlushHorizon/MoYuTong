@echo off
cd /d "%~dp0"
rem Stop the QQ web service (ASCII-only batch, codepage safe)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1" -Stop
pause