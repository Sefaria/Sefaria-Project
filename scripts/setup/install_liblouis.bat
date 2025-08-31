@echo off
REM liblouis installation script for Windows

setlocal enabledelayedexpansion

echo Installing liblouis for Windows...

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found in PATH
    echo Please install Python and add it to your PATH
    exit /b 1
)

REM Run the Python installer
python "%SCRIPT_DIR%install_liblouis.py" %*

if errorlevel 1 (
    echo Error: Installation failed
    exit /b 1
)

echo ✅ liblouis installation completed!
