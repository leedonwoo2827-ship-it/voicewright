@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\voicewright.exe" (
  echo [ERROR] .venv not found or voicewright not installed.
  echo         Run install.bat first.
  pause
  exit /b 1
)

if not exist "assets\onnx\vocoder.onnx" (
  echo [ERROR] Model assets missing.
  echo         Run install.bat first.
  pause
  exit /b 1
)

echo ============================================
echo  voicewright web UI
echo ============================================
echo  Browser:  http://localhost:7878
echo  Stop:     Ctrl+C
echo ============================================
echo.

.venv\Scripts\voicewright.exe serve

endlocal
