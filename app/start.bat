@echo off
cd /d "%~dp0"
rem QQ web launcher - all logic lives in launcher.ps1 (ASCII-only batch, codepage safe)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1" %*