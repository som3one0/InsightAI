# InsightAI Backend Startup Script
# Usage: .\start_backend.ps1

Write-Host "--- InsightAI API Startup ---" -ForegroundColor Cyan

# Ensure we are in the backend directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Check for virtual environment
if (Test-Path "..\venv\Scripts\python.exe") {
    $PYTHON_PATH = "..\venv\Scripts\python.exe"
    Write-Host "Using virtual environment: $PYTHON_PATH" -ForegroundColor Gray
} else {
    $PYTHON_PATH = "python"
    Write-Host "Virtual environment not found, using system python" -ForegroundColor Yellow
}

# Kill existing uvicorn/python processes on port 8000
Write-Host "Cleaning up existing processes on port 8000..." -ForegroundColor Gray
taskkill /F /IM python.exe /T 2>$null

# Start Uvicorn with the CORRECT entry point
Write-Host "Launching InsightAI Engine on http://127.0.0.1:8000/api ..." -ForegroundColor Green
& $PYTHON_PATH -m uvicorn main:app --reload --port 8000 --host 127.0.0.1
