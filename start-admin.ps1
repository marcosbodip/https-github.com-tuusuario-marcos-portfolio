$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not $env:ADMIN_CODE) {
  $env:ADMIN_CODE = "marcos-admin"
}

$env:AUTO_GIT_PUSH = "true"

Write-Host ""
Write-Host "Marcos Portfolio Admin" -ForegroundColor Cyan
Write-Host "----------------------" -ForegroundColor DarkCyan
Write-Host "URL:  http://localhost:3000/admin.html"
Write-Host "Code: $env:ADMIN_CODE"
Write-Host ""
Write-Host "Keep this window open while using the admin."
Write-Host "Press Ctrl+C here to stop it."
Write-Host ""

Start-Process "http://localhost:3000/admin.html"
npm start
