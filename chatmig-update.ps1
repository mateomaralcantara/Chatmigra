param(
    [string]$Message = "chore: update"
)

$root = "C:\Users\martin\Desktop\APPS\ChatMi"

Write-Host "== Usando Node 24.11.1 con nvm ==" -ForegroundColor Cyan
nvm use 24.11.1 | Out-Null

Set-Location $root

Write-Host "== Ejecutando build (npm run build) ==" -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build fallo. No se hara commit ni push." -ForegroundColor Red
    exit 1
}

Write-Host "== Estado de git antes del commit ==" -ForegroundColor Cyan
git status

Write-Host "== Haciendo commit ==" -ForegroundColor Cyan
git add .
git commit -m $Message

Write-Host "== Haciendo push a origin/main ==" -ForegroundColor Cyan
git push origin main

Write-Host "== Listo. Build + commit + push completados ==" -ForegroundColor Green
