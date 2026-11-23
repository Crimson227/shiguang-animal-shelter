@echo off
setlocal
title Shelter Startup
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
set "START_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %START_RESULT%