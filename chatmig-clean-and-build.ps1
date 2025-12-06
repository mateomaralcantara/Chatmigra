$root = "C:\Users\martin\Desktop\APPS\ChatMi"

Write-Host "== Usando Node 24.11.1 con nvm ==" -ForegroundColor Cyan
nvm use 24.11.1 | Out-Null

Set-Location $root

Write-Host "== Borrando node_modules, dist y package-lock.json ==" -ForegroundColor Cyan
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }

Write-Host "== Limpiando cache de npm ==" -ForegroundColor Cyan
npm cache clean --force

Write-Host "== Instalando dependencias (npm install) ==" -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install fallo. Revisa el error antes de continuar." -ForegroundColor Red
    exit 1
}

Write-Host "== Ejecutando build (npm run build) ==" -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build fallo. Revisa el error antes de hacer commit." -ForegroundColor Red
    exit 1
}

Write-Host "== Proyecto limpio e instalacion completada ==" -ForegroundColor Green
