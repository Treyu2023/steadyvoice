@echo off
cd /d "%~dp0"
if not exist "%~dp0Start-SpeakWell.ps1" (
  echo Unzip the whole SpeakWell folder, then double-click this file again.
  pause
  exit /b 1
)
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Start-SpeakWell.ps1"
if errorlevel 1 (
  echo Speak Well did not open.
  echo Unzip the whole folder, then double-click Start-SpeakWell.bat again.
  pause
)
