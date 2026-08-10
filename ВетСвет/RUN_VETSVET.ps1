$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$tsx = Join-Path (Split-Path -Parent $projectRoot) 'node_modules\.bin\tsx.cmd'

if (-not (Test-Path $tsx)) {
    throw 'VetSvet runtime не найден. Ожидался ..\node_modules\.bin\tsx.cmd.'
}

Set-Location $projectRoot
Write-Host 'VetSvet local environment: http://127.0.0.1:4300' -ForegroundColor Cyan
& $tsx 'apps\api\src\dev-server.ts'
