$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$env:LOCAL_ADMIN_BYPASS = "true"
$env:ADMIN_CODE = "28122812"
$env:AUTO_GIT_PUSH = "true"

Write-Host ""
Write-Host "Marcos Portfolio Admin" -ForegroundColor Cyan
Write-Host "----------------------" -ForegroundColor DarkCyan
Write-Host "URL:  http://localhost:3000/admin.html"
Write-Host "Local access: enabled"
Write-Host "Admin code: 28122812"
Write-Host ""
Write-Host "Keep this window open while using the admin."
Write-Host "Press Ctrl+C here to stop it."
Write-Host ""

Start-Process "http://localhost:3000/admin.html"
npm start
