@echo off
title Universal Billing System
color 0A

echo.
echo  ========================================
echo   Universal Billing System v4.0
echo   Starting secure server...
echo  ========================================
echo.

:: Check Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found!
    echo  Please install Python from https://python.org
    echo  Make sure to tick "Add Python to PATH" during install.
    pause
    exit /b
)

:: Install dependencies if needed
echo  Checking dependencies...
pip install -r requirements.txt --quiet

:: Open browser after 2 seconds
start "" timeout /t 2 >nul && start "" "http://localhost:5004"

:: Start Flask server
echo  Server running at http://localhost:5004
echo  Press Ctrl+C to stop.
echo.
python app.py

pause
