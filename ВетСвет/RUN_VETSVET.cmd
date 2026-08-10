@echo off
setlocal
cd /d "%~dp0"

if not exist "..\node_modules\.bin\tsx.cmd" (
  echo [VetSvet] Runtime not found. Install workspace dependencies first.
  echo Expected: ..\node_modules\.bin\tsx.cmd
  pause
  exit /b 1
)

echo [VetSvet] Starting local development environment...
echo [VetSvet] Public experience: http://127.0.0.1:4300
echo [VetSvet] API health:        http://127.0.0.1:4300/api/healthz
start "VetSvet local" http://127.0.0.1:4300
"..\node_modules\.bin\tsx.cmd" apps\api\src\dev-server.ts
