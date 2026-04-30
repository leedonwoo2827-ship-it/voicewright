@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\voicewright.exe" (
  echo [ERROR] .venv not found or voicewright not installed.
  echo         Run install.bat first.
  pause
  exit /b 1
)

.venv\Scripts\voicewright.exe doctor
echo.
pause
endlocal
