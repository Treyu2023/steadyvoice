@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0Start-SteadyVoice.ps1" (
  echo Unzip the whole SteadyVoice folder, then double-click this file again.
  echo Do not move this file by itself.
  pause
  exit /b 1
)
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-SteadyVoice.ps1"
if errorlevel 1 (
  echo SteadyVoice did not open.
  echo Unzip the whole folder, then double-click Start-SteadyVoice.bat again.
  pause
  exit /b 1
)
exit /b 0
