@echo off
chcp 65001 >nul
title Чайная история — остановка
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force; Write-Host 'Сервер остановлен.' -ForegroundColor Green } else { Write-Host 'Сервер не запущен.' -ForegroundColor DarkGray }"
timeout /t 2 /nobreak >nul
exit
