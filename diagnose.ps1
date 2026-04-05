# InsightAI Connection & Environment Diagnostic
# Run this to see exactly why InsightAI isn't starting.

Write-Host "--- InsightAI Environment Diagnostic ---" -ForegroundColor Cyan

# 1. Check Python
$PythonVer = & python --version 2>&1
if ($LastExitCode -ne 0) {
    Write-Warning "[FAIL] Python not found in path. Try 'py --version' or install Python 3.10+."
} else {
    Write-Host "[PASS] Python: $PythonVer" -ForegroundColor Green
}

# 2. Check Node
$NodeVer = & node --version 2>&1
if ($LastExitCode -ne 0) {
    Write-Warning "[FAIL] Node.js not found in path. Install Node.js v20+."
} else {
    Write-Host "[PASS] Node.js: $NodeVer" -ForegroundColor Green
}

# 3. Check Venv
if (Test-Path "venv\Scripts\python.exe") {
    Write-Host "[PASS] Virtual Environment found." -ForegroundColor Green
} else {
    Write-Warning "[WARN] 'venv' not found. You may need to create it: python -m venv venv"
}

# 4. Check Frontend Dependencies
if (Test-Path "frontend\node_modules") {
    Write-Host "[PASS] frontend/node_modules found." -ForegroundColor Green
} else {
    Write-Warning "[FAIL] frontend/node_modules missing. Run 'cd frontend; npm install'"
}

# 5. Check Ports
$Port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($Port8000) {
    Write-Warning "[BLOCK] Port 8000 is already in use by PID: $($Port8000.OwningProcess)"
} else {
    Write-Host "[PASS] Port 8000 is available." -ForegroundColor Green
}

$Port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($Port3000) {
    Write-Warning "[BLOCK] Port 3000 is already in use by PID: $($Port3000.OwningProcess)"
} else {
    Write-Host "[PASS] Port 3000 is available." -ForegroundColor Green
}

Write-Host "`nRecommendation: If everything PASSES, try running this fixed command:" -ForegroundColor Yellow
Write-Host "powershell -ExecutionPolicy Bypass -File .\start_all.ps1"
