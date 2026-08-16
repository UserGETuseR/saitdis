# Лёгкий статический HTTP-сервер на PowerShell для «Чайных историй»
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$mime = @{
  ".html" = "text/html; charset=utf-8";
  ".css"  = "text/css; charset=utf-8";
  ".js"   = "application/javascript; charset=utf-8";
  ".json" = "application/json; charset=utf-8";
  ".svg"  = "image/svg+xml";
  ".png"  = "image/png";
  ".jpg"  = "image/jpeg";
  ".jpeg" = "image/jpeg";
  ".gif"  = "image/gif";
  ".ico"  = "image/x-icon";
  ".woff" = "font/woff";
  ".woff2"= "font/woff2";
  ".ttf"  = "font/ttf";
  ".map"  = "application/json";
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Не удалось занять порт $Port. Попробуйте другой порт." -ForegroundColor Red
  exit 1
}

Write-Host "==================================================" -ForegroundColor DarkYellow
Write-Host "  Чайная история запущена" -ForegroundColor Yellow
Write-Host "  Открой в браузере:  $prefix" -ForegroundColor Green
Write-Host "  Остановить: закрой это окно или Ctrl+C" -ForegroundColor DarkGray
Write-Host "==================================================" -ForegroundColor DarkYellow

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq "/" -or [string]::IsNullOrEmpty($path)) { $path = "/index.html" }

    # защита от выхода за пределы каталога
    $relative = $path.TrimStart("/").Replace("/", "\")
    $full = Join-Path $root $relative
    $full = [System.IO.Path]::GetFullPath($full)

    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }

    if (Test-Path $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]
      if (-not $ct) { $ct = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentType = $ct
      $res.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      $res.Headers.Add("Pragma", "no-cache")
      $res.Headers.Add("Expires", "0")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("200  " + $path) -ForegroundColor DarkGray
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - не найдено: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
      Write-Host ("404  " + $path) -ForegroundColor Red
    }
    $res.OutputStream.Close()
  } catch {
    # игнорируем единичные сбои соединений
  }
}
