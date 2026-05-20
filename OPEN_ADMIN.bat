@echo off
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoExit -File "%~dp0start-admin.ps1"
