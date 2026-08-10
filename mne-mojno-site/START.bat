@echo off
chcp 65001 >nul
title Мне можно — локальный сервер
cd /d "%~dp0"

echo ============================================
echo   Студия «Мне можно» — запуск сайта
echo ============================================
echo.

rem --- Пытаемся поднять локальный сервер (нужно для видео-скраба) ---

rem 1) Python 3
where python >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Найден Python — поднимаю сервер на http://localhost:8080
  start "" http://localhost:8080
  python -m http.server 8080
  goto :eof
)

rem 2) Python launcher (py)
where py >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Найден Python (py) — поднимаю сервер на http://localhost:8080
  start "" http://localhost:8080
  py -m http.server 8080
  goto :eof
)

rem 3) Node.js (npx http-server)
where npx >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Найден Node.js — поднимаю сервер на http://localhost:8080
  start "" http://localhost:8080
  npx --yes http-server -p 8080 -c-1
  goto :eof
)

rem 4) Нет ни Python, ни Node — открываем файл напрямую
echo [!] Локальный сервер не найден (нет Python и Node.js).
echo     Открываю index.html напрямую. Сайт работает,
echo     но перемотка видео по скроллу может быть недоступна.
echo     Чтобы включить видео-скраб — установите Python с python.org
echo     и снова запустите START.bat.
echo.
start "" "%~dp0index.html"
pause
