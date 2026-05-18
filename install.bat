@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  voicewright installer
echo ============================================
echo.

REM ---- Python check ----
python --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not found in PATH.
  echo         Install Python 3.11-3.13 from https://python.org
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('python --version') do set PYVER=%%v
echo Python: !PYVER!
echo.

REM ---- venv ----
if not exist ".venv\Scripts\python.exe" (
  echo [1/5] Creating virtual environment ^(.venv^)...
  python -m venv .venv
  if errorlevel 1 ( echo [ERROR] venv creation failed. & pause & exit /b 1 )
) else (
  echo [1/5] Virtual environment exists. Skipping.
)

REM ---- pip upgrade ----
echo [2/5] Upgrading pip...
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 ( echo [ERROR] pip upgrade failed. & pause & exit /b 1 )

REM ---- GPU detection ----
echo [3/5] Detecting GPU...
where nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo        No NVIDIA GPU detected. Will install CPU mode.
  set EXTRAS=cpu
) else (
  echo        NVIDIA GPU detected. Will install GPU mode ^(CUDA^).
  set EXTRAS=gpu
)

REM ---- pip install ----
echo [4/5] Installing voicewright with [!EXTRAS!] extras ^(may take 5-10 minutes^)...
.venv\Scripts\python.exe -m pip install -e ".[!EXTRAS!]"
if errorlevel 1 ( echo [ERROR] pip install failed. & pause & exit /b 1 )

REM ---- model assets ----
if exist "assets\onnx\vocoder.onnx" (
  echo [5/5] Model assets already present. Skipping download.
) else (
  echo [5/5] Downloading model assets from Hugging Face ^(~250MB^)...
  where git >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] git not found. Install from https://git-scm.com
    pause & exit /b 1
  )
  git lfs install
  if errorlevel 1 (
    echo [ERROR] git-lfs is required. Install from https://git-lfs.com
    pause & exit /b 1
  )
  git clone https://huggingface.co/Supertone/supertonic-3 assets
  if errorlevel 1 (
    echo [ERROR] Model download failed.
    pause & exit /b 1
  )
)

echo.
echo ============================================
echo  Install complete. Running doctor...
echo ============================================
echo.
.venv\Scripts\voicewright.exe doctor
echo.
echo ============================================
echo  Next: double-click start.bat to launch the web UI
echo ============================================
echo.
pause
endlocal
