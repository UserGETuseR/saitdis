@echo off
chcp 65001 >nul
title Чайная история
cd /d "%~dp0"

echo.
echo   ============================================
echo     Чайная история — запуск локального сервера
echo   ============================================
echo.
echo   Открываю http://localhost:8080/ в браузере...
echo   Чтобы остановить — закрой окно сервера.
echo.

start "Чайная история — сервер" powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/"
exit
старт
