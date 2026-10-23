param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [string]$ProjectRef = "vovxtzcngqzdwjddrcis"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Step([string]$Text) {
    Write-Host ""
    Write-Host ("=" * 90) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 90) -ForegroundColor DarkGray
}

function OK([string]$Text) {
    Write-Host "[OK] $Text" -ForegroundColor Green
}

if (!(Test-Path -LiteralPath $ProjectRoot)) {
    throw "No existe: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

Step "1. VERIFICANDO REPOSITORIO CHATMI"

$Remote = git remote get-url origin
if ($LASTEXITCODE -ne 0) {
    throw "No pude leer el remote de Git."
}

if ($Remote -notmatch "mateomaralcantara/Chatmigra") {
    throw "Este script solo puede ejecutarse en mateomaralcantara/Chatmigra."
}

Write-Host "Remote: $Remote"
Write-Host "Project ref Supabase: $ProjectRef"

git fetch origin
if ($LASTEXITCODE -ne 0) {
    throw "git fetch falló."
}

git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    throw "No pude actualizar main con fast-forward. No se modificó Supabase."
}

OK "Repositorio correcto y actualizado."

Step "2. VERIFICANDO MIGRACION"

$Migration = Join-Path $ProjectRoot "supabase\migrations\202610230001_chatmi_core.sql"

if (!(Test-Path -LiteralPath $Migration)) {
    throw "No existe la migración ChatMi: $Migration"
}

OK "Migración encontrada."

Step "3. SUPABASE CLI"

npx --yes supabase@latest --version
if ($LASTEXITCODE -ne 0) {
    throw "No pude ejecutar Supabase CLI."
}

Write-Host ""
Write-Host "Se abrirá el login oficial de Supabase si tu CLI no tiene sesión." -ForegroundColor Yellow
npx --yes supabase@latest login
if ($LASTEXITCODE -ne 0) {
    throw "No se completó el login de Supabase."
}

Step "4. ENLAZANDO EXCLUSIVAMENTE CHATMI"

if (!(Test-Path -LiteralPath (Join-Path $ProjectRoot "supabase\config.toml"))) {
    npx --yes supabase@latest init
    if ($LASTEXITCODE -ne 0) {
        throw "supabase init falló."
    }
}

npx --yes supabase@latest link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
    throw "No pude enlazar Supabase $ProjectRef. No se aplicó ninguna migración."
}

OK "Proyecto ChatMi enlazado: $ProjectRef"

Step "5. DRY RUN OBLIGATORIO"

npx --yes supabase@latest db push --linked --dry-run
if ($LASTEXITCODE -ne 0) {
    throw "El dry-run falló. No se aplicó ninguna migración."
}

OK "Dry-run correcto."

Step "6. APLICANDO MIGRACION"

npx --yes supabase@latest db push --linked
if ($LASTEXITCODE -ne 0) {
    throw "db push falló. Revisa el error anterior."
}

OK "Migración aplicada."

Step "7. VERIFICANDO HISTORIAL"

npx --yes supabase@latest migration list --linked
if ($LASTEXITCODE -ne 0) {
    throw "La migración se aplicó, pero no pude leer migration list."
}

Write-Host ""
Write-Host ("=" * 90) -ForegroundColor Green
Write-Host " CHATMI SUPABASE ACTUALIZADO: $ProjectRef" -ForegroundColor Green
Write-Host ("=" * 90) -ForegroundColor Green
Write-Host ""
Write-Host "No se ejecutó db reset, no se borraron datos y no se usó otro proyecto." -ForegroundColor White
