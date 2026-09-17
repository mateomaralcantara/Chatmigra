$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"

$ExpectedRepo = "mateomaralcantara/Chatmigra"
$ExpectedProjectName = "chatmigra-ztgg"
$ExpectedProjectId = "prj_qllAmyh0D6Xq8MvTjXtUuaEMULFV"
$ExpectedOrgId = "team_w0vMVKDgdIrwNEkl4fTVRO47"

$CurrentBranch = $null
$DeployUrl = $null

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 100) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 100) -ForegroundColor DarkGray
}

function OK {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Warn {
    param([string]$Text)
    Write-Host "[!]  $Text" -ForegroundColor Yellow
}

function Fail {
    param([string]$Text)
    Write-Host "[ERROR] $Text" -ForegroundColor Red
}

function Run-Or-Fail {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "$Name..." -ForegroundColor Gray

    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw "$Name falló."
    }

    OK $Name
}

Clear-Host

Write-Host ""
Write-Host " CHATMI — PUBLICACION ULTIMATE CONTROLADA" -ForegroundColor Cyan
Write-Host " GitHub + Vercel Production" -ForegroundColor White
Write-Host ""

Set-Location $ProjectRoot

# ============================================================
# 1. IDENTIDAD LOCAL
# ============================================================

Section "1. VERIFICANDO REPOSITORIO"

if (!(Test-Path ".git")) {
    throw "No existe .git."
}

$Remote = (git remote get-url origin).Trim()

Write-Host "Remote:"
Write-Host "  $Remote" -ForegroundColor Cyan

if ($Remote -notmatch "mateomaralcantara/Chatmigra") {
    throw "Repositorio incorrecto. No publicaré."
}

OK "Repositorio ChatMigra confirmado."

$CurrentBranch = (git branch --show-current).Trim()

Write-Host "Branch:"
Write-Host "  $CurrentBranch" -ForegroundColor Cyan

# ============================================================
# 2. VERIFICAR QUE LA NUEVA UI REALMENTE EXISTE
# ============================================================

Section "2. VERIFICANDO INTERFAZ ULTIMATE LOCAL"

$RequiredFiles = @(
    "src\ui\PremiumShell.tsx",
    "src\styles\chatmi-ultimate.css"
)

foreach ($Relative in $RequiredFiles) {

    $Full = Join-Path $ProjectRoot $Relative

    if (!(Test-Path $Full)) {
        throw "NO existe $Relative. La interfaz Ultimate no está instalada localmente."
    }

    $Length = (Get-Item $Full).Length

    if ($Length -lt 100) {
        throw "$Relative parece vacío o incompleto."
    }

    OK "$Relative ($Length bytes)"
}

$MainPath = Join-Path $ProjectRoot "src\main.tsx"

$MainContent = Get-Content $MainPath -Raw

if ($MainContent -notmatch "PremiumShell") {
    throw "main.tsx no está utilizando PremiumShell."
}

if ($MainContent -notmatch "chatmi-ultimate\.css") {
    throw "main.tsx no importa chatmi-ultimate.css."
}

OK "PremiumShell importado."
OK "chatmi-ultimate.css importado."

# ============================================================
# 3. VERIFICAR VERCEL LINK
# ============================================================

Section "3. VERIFICANDO VINCULO VERCEL"

if (!(Test-Path ".vercel\project.json")) {

    Warn "No existe .vercel/project.json."

    Write-Host "Vinculando exclusivamente a $ExpectedProjectName..." -ForegroundColor Yellow

    vercel link `
        --yes `
        --project $ExpectedProjectName `
        --scope monseoweb-project

    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo vincular Vercel."
    }
}

$ProjectJson = Get-Content ".vercel\project.json" -Raw | ConvertFrom-Json

Write-Host ""
Write-Host "Project ID : $($ProjectJson.projectId)"
Write-Host "Org ID     : $($ProjectJson.orgId)"

if ($ProjectJson.projectId -ne $ExpectedProjectId) {
    throw "PROJECT ID INCORRECTO. Publicación cancelada."
}

if ($ProjectJson.orgId -ne $ExpectedOrgId) {
    throw "ORG ID INCORRECTO. Publicación cancelada."
}

OK "Vercel vinculado al proyecto correcto."

# ============================================================
# 4. INSPECCION REMOTA
# ============================================================

Section "4. CONFIRMANDO PROYECTO VERCEL"

$Inspect = vercel project inspect $ExpectedProjectName 2>&1 | Out-String

Write-Host $Inspect

if ($Inspect -notmatch [regex]::Escape($ExpectedProjectId)) {
    throw "Vercel no devolvió el Project ID esperado."
}

if ($Inspect -notmatch "Framework Preset\s+Vite") {
    Warn "No pude confirmar automáticamente Framework Preset Vite."
}
else {
    OK "Framework Vite confirmado."
}

OK "Proyecto $ExpectedProjectName confirmado."

# ============================================================
# 5. GIT FETCH
# ============================================================

Section "5. SINCRONIZANDO GITHUB"

Run-Or-Fail "git fetch origin" {
    git fetch origin
}

$RemoteMain = (
    git rev-parse origin/main
).Trim()

$LocalHead = (
    git rev-parse HEAD
).Trim()

Write-Host ""
Write-Host "origin/main : $RemoteMain"
Write-Host "HEAD        : $LocalHead"

# ============================================================
# 6. VALIDACION DE CODIGO
# ============================================================

Section "6. TYPESCRIPT + TESTS + BUILD"

Run-Or-Fail "TypeScript" {
    npx tsc --noEmit
}

Run-Or-Fail "Tests" {
    npm test
}

Run-Or-Fail "Build producción" {
    npm run build
}

# ============================================================
# 7. AUDIT
# ============================================================

Section "7. AUDITORIA PRODUCCION"

$AuditRaw = npm audit --omit=dev --json 2>$null | Out-String

try {

    $Audit = $AuditRaw | ConvertFrom-Json
    $V = $Audit.metadata.vulnerabilities

    Write-Host "Critical : $($V.critical)"
    Write-Host "High     : $($V.high)"
    Write-Host "Moderate : $($V.moderate)"
    Write-Host "Low      : $($V.low)"

    if ($V.critical -gt 0) {
        throw "Hay vulnerabilidades críticas."
    }
}
catch {

    if ($_.Exception.Message -match "vulnerabilidades críticas") {
        throw
    }

    Warn "No se pudo interpretar completamente npm audit."
}

# ============================================================
# 8. ESTADO GIT
# ============================================================

Section "8. CAMBIOS QUE SERAN PUBLICADOS"

$Status = git status --short

if ([string]::IsNullOrWhiteSpace(($Status | Out-String))) {

    Warn "No existen cambios sin commit."

}
else {

    $Status | ForEach-Object {
        Write-Host $_
    }
}

# ============================================================
# 9. COMMIT DE LA NUEVA UI
# ============================================================

Section "9. CREANDO COMMIT"

if (-not [string]::IsNullOrWhiteSpace(($Status | Out-String))) {

    git add `
        src `
        api `
        package.json `
        package-lock.json `
        vercel.json `
        2>$null

    # Algunos archivos pueden no existir.
    # Añadir scripts específicos sin fallar.
    if (Test-Path "scripts") {
        git add scripts
    }

    $Staged = git diff --cached --name-only

    if (-not [string]::IsNullOrWhiteSpace(($Staged | Out-String))) {

        Write-Host ""
        Write-Host "Archivos staged:" -ForegroundColor Cyan

        $Staged | ForEach-Object {
            Write-Host "  $_"
        }

        git commit -m "feat: ChatMi Ultimate UI y API unificada"

        if ($LASTEXITCODE -ne 0) {
            throw "git commit falló."
        }

        OK "Commit creado."
    }
    else {

        Warn "No había cambios elegibles para commit."
    }
}
else {

    OK "No hay cambios sin registrar."
}

# ============================================================
# 10. ACTUALIZAR MAIN DE FORMA SEGURA
# ============================================================

Section "10. PUBLICANDO EN GITHUB MAIN"

$CurrentHead = (
    git rev-parse HEAD
).Trim()

git fetch origin

$RemoteMainAfterFetch = (
    git rev-parse origin/main
).Trim()

$MergeBase = (
    git merge-base HEAD origin/main
).Trim()

if ($MergeBase -ne $RemoteMainAfterFetch) {

    throw @"
origin/main contiene cambios que no están en tu HEAD.

NO voy a sobreescribirlos.

HEAD:
$CurrentHead

origin/main:
$RemoteMainAfterFetch

Merge base:
$MergeBase
"@
}

Write-Host ""
Write-Host "Publicando HEAD -> origin/main..." -ForegroundColor Yellow

git push origin HEAD:main

if ($LASTEXITCODE -ne 0) {
    throw "git push origin HEAD:main falló."
}

OK "GitHub main actualizado."

$LocalAfterPush = (
    git rev-parse HEAD
).Trim()

$RemoteAfterPush = (
    git ls-remote origin refs/heads/main |
    ForEach-Object {
        ($_ -split "\s+")[0]
    }
).Trim()

Write-Host ""
Write-Host "Local HEAD  : $LocalAfterPush"
Write-Host "Remote main : $RemoteAfterPush"

if ($LocalAfterPush -ne $RemoteAfterPush) {
    throw "GitHub main NO coincide con el commit local."
}

OK "GitHub verificado byte a byte por commit SHA."

# ============================================================
# 11. DEPLOY PRODUCCION
# ============================================================

Section "11. DESPLEGANDO EN VERCEL PRODUCTION"

Write-Host ""
Write-Host "Destino confirmado:" -ForegroundColor Gray
Write-Host "  $ExpectedProjectName"
Write-Host "  $ExpectedProjectId"
Write-Host ""

$DeployOutput = (
    vercel deploy `
        --prod `
        --yes `
        --scope monseoweb-project `
        2>&1 |
    Tee-Object -Variable DeployLines
)

$DeployExitCode = $LASTEXITCODE

$DeployOutput | ForEach-Object {
    Write-Host $_
}

if ($DeployExitCode -ne 0) {
    throw "Deployment de Vercel falló."
}

# Encontrar última URL del output.
$DeployUrl = (
    $DeployOutput |
    Select-String `
        -Pattern 'https://[^\s]+' `
        -AllMatches |
    ForEach-Object {
        $_.Matches.Value
    } |
    Select-Object -Last 1
)

if ($DeployUrl) {

    OK "Deployment generado:"
    Write-Host "  $DeployUrl" -ForegroundColor Cyan
}
else {

    Warn "Deployment terminó pero no pude extraer URL automáticamente."
}

# ============================================================
# 12. PROBAR PRODUCCION
# ============================================================

Section "12. VALIDANDO WWW.CHATMIG.COM"

$Production = "https://www.chatmig.com"

try {

    $Home = Invoke-WebRequest `
        -Uri $Production `
        -UseBasicParsing `
        -TimeoutSec 30

    Write-Host "HOME HTTP: $($Home.StatusCode)"

    if ($Home.StatusCode -ne 200) {
        throw "La página principal no devuelve HTTP 200."
    }

    OK "Producción responde."
}
catch {

    throw "www.chatmig.com no respondió correctamente: $($_.Exception.Message)"
}

# ============================================================
# 13. PROBAR API PRODUCCION
# ============================================================

Section "13. VALIDANDO API PRODUCCION"

$ApiRoutes = @(
    "/api/gemini",
    "/api/gemini-ephemeral-token",
    "/api/image-search"
)

foreach ($Route in $ApiRoutes) {

    $Url = "$Production$Route"

    try {

        $Response = Invoke-WebRequest `
            -Uri $Url `
            -Method POST `
            -ContentType "application/json" `
            -Body "{}" `
            -UseBasicParsing `
            -TimeoutSec 20

        $StatusCode = [int]$Response.StatusCode
    }
    catch {

        if ($_.Exception.Response) {

            $StatusCode = [int]$_.Exception.Response.StatusCode
        }
        else {

            $StatusCode = 0
        }
    }

    Write-Host (
        "{0,-40} HTTP {1}" -f
        $Route,
        $StatusCode
    )

    if ($StatusCode -eq 0) {
        throw "$Route no es alcanzable."
    }

    if ($StatusCode -eq 404) {
        throw "$Route NO existe en producción."
    }

    OK "$Route desplegada."
}

# ============================================================
# 14. RESULTADO
# ============================================================

Section "PUBLICACION COMPLETADA"

Write-Host ""
Write-Host "GITHUB" -ForegroundColor White
Write-Host "  mateomaralcantara/Chatmigra" -ForegroundColor Cyan
Write-Host "  main = $RemoteAfterPush" -ForegroundColor Green

Write-Host ""
Write-Host "VERCEL" -ForegroundColor White
Write-Host "  $ExpectedProjectName" -ForegroundColor Cyan
Write-Host "  $ExpectedProjectId" -ForegroundColor DarkGray

Write-Host ""
Write-Host "PRODUCCION" -ForegroundColor White
Write-Host "  https://www.chatmig.com" -ForegroundColor Green

Write-Host ""
Write-Host "UI" -ForegroundColor White
Write-Host "  PremiumShell.tsx" -ForegroundColor Green
Write-Host "  chatmi-ultimate.css" -ForegroundColor Green

Write-Host ""
Write-Host "API" -ForegroundColor White
Write-Host "  /api/gemini" -ForegroundColor Green
Write-Host "  /api/gemini-ephemeral-token" -ForegroundColor Green
Write-Host "  /api/image-search" -ForegroundColor Green

Write-Host ""
Write-Host ("=" * 100) -ForegroundColor Green
Write-Host " CHATMI ULTIMATE — GITHUB + VERCEL + PRODUCCION SINCRONIZADOS" -ForegroundColor Green
Write-Host ("=" * 100) -ForegroundColor Green