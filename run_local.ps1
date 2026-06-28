# Paper Trading Pro - Local Development Launcher
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   Starting Paper Trading Pro Local Servers  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Ensure we are in the workspace root directory
$RootFolder = Resolve-Path $PSScriptRoot

# 1. Start backend server
Write-Host "`n[1/3] Starting FastAPI Backend (Port 8000)..." -ForegroundColor Yellow
$BackendCommand = "`$Host.UI.RawUI.WindowTitle = 'Paper Trading Pro: Backend Server'; cd '$RootFolder\backend'; & '$RootFolder\.venv\Scripts\alembic' upgrade head; & '$RootFolder\.venv\Scripts\python' -m uvicorn app.main:app --port 8000 --reload"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "$BackendCommand" -WindowStyle Normal

# 2. Start frontend server
Write-Host "[2/3] Starting Vite Frontend (Port 5173)..." -ForegroundColor Yellow
$FrontendCommand = "`$Host.UI.RawUI.WindowTitle = 'Paper Trading Pro: Frontend Dev Server'; cd '$RootFolder\Frontend'; if (-not (Test-Path node_modules)) { Write-Host 'Installing node_modules...'; npm install }; npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "$FrontendCommand" -WindowStyle Normal

# 3. Complete
Write-Host "`n[3/3] Launch complete!" -ForegroundColor Green
Write-Host "---------------------------------------------" -ForegroundColor Cyan
Write-Host "FastAPI Backend is starting on: http://127.0.0.1:8000" -ForegroundColor White
Write-Host "React Frontend is starting on:  http://localhost:5173" -ForegroundColor White
Write-Host "---------------------------------------------" -ForegroundColor Cyan
Write-Host "Please wait a few seconds for the servers to bind, then open http://localhost:5173 in your browser." -ForegroundColor Gray
Write-Host "You can close this window. Do not close the newly opened windows." -ForegroundColor Yellow
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
