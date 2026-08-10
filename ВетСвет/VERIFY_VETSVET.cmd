@echo off
setlocal
cd /d "%~dp0"
set "DATABASE_URL=postgresql://vetsvet:vetsvet@127.0.0.1:5432/vetsvet"
call npm.cmd run test:foundation || exit /b 1
call npm.cmd run test:persistence || exit /b 1
call npm.cmd run test:telegram || exit /b 1
call npm.cmd run test:worker || exit /b 1
call ..\node_modules\.bin\prisma.cmd validate --schema prisma\schema.prisma || exit /b 1
echo.
echo VetSvet verification completed successfully.
