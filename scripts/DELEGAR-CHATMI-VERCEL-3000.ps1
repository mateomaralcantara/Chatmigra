param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ============================================================
# CONFIGURACION CONFIRMADA DE CHATMI
# ============================================================

$ExpectedProjectName = "chatmigra-ztgg"
$ExpectedProjectId   = "prj_qllAmyh0D6Xq8MvTjXtUuaEMULFV"

$ExpectedScope       = "monseoweb-project"
$ExpectedOrgId       = "team_w0vMVKDgdIrwNEkl4fTVRO47"

$ExpectedGitRemote   = "mateomaralcantara/Chatmigra"

$Port                = 3000

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path `
    $ProjectRoot `
    ".hardening-backups\vercel-link-$Stamp"

$VercelFolder = Join-Path $ProjectRoot ".vercel"
$ProjectJson  = Join-Path $VercelFolder "project.json"

$EnvLocal = Join-Path $ProjectRoot ".env.local"

$EnvDevelopmentLocal = Join-Path `
    $ProjectRoot `
    ".env.development.local"

# ============================================================
# HELPERS
# ============================================================

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

function Set-EnvValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value
    )

    $Lines = @()

    if (Test-Path $Path) {
        $Lines = @(Get-Content -LiteralPath $Path)
    }

    $Found = $false

    $NewLines = @(
        foreach ($Line in $Lines) {

            if (
                $Line -match
                "^\s*$([regex]::Escape($Name))\s*="
            ) {

                "$Name=$Value"
                $Found = $true
            }
            else {

                $Line
            }
        }
    )

    if (!$Found) {

        $NewLines += "$Name=$Value"
    }

    Set-Content `
        -LiteralPath $Path `
        -Value $NewLines `
        -Encoding UTF8
}

function Get-PortPids {
    param([int]$TargetPort)

    try {

        return @(
            Get-NetTCPConnection `
                -LocalPort $TargetPort `
                -State Listen `
                -ErrorAction SilentlyContinue |
            Select-Object `
                -ExpandProperty OwningProcess `
                -Unique
        )
    }
    catch {

        return @()
    }
}

function Test-Port {
    param([int]$TargetPort)

    return @(
        Get-PortPids $TargetPort
    ).Count -gt 0
}

function Wait-Port {
    param(
        [int]$TargetPort,
        [int]$Attempts = 60
    )

    for ($i = 1; $i -le $Attempts; $i++) {

        if (Test-Port $TargetPort) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Get-HttpStatus {
    param(
        [string]$Url,
        [string]$Method = "GET"
    )

    try {

        if ($Method -eq "POST") {

            $Response = Invoke-WebRequest `
                -Uri $Url `
                -Method POST `
                -ContentType "application/json" `
                -Body "{}" `
                -TimeoutSec 10 `
                -UseBasicParsing
        }
        else {

            $Response = Invoke-WebRequest `
                -Uri $Url `
                -Method GET `
                -TimeoutSec 10 `
                -UseBasicParsing
        }

        return [int]$Response.StatusCode
    }
    catch {

        if ($_.Exception.Response) {

            try {

                return [int]$_.Exception.Response.StatusCode
            }
            catch {

                return 500
            }
        }

        return 0
    }
}

function Assert-ApiRoute {
    param(
        [string]$Name,
        [string]$Url
    )

    $Status = Get-HttpStatus `
        -Url $Url `
        -Method "POST"

    Write-Host (
        "{0,-36} HTTP {1}" -f
        $Name,
        $Status
    )

    if ($Status -eq 0) {

        throw "$Name no responde."
    }

    if ($Status -eq 404) {

        throw "$Name devuelve 404. La función no está siendo servida."
    }

    # 200 / 400 / 401 / 403 / 405 son evidencia suficiente
    # de que la ruta existe para este diagnóstico.

    OK "$Name existe y es alcanzable."
}

# ============================================================
# START
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI — DELEGACION VERCEL FULL STACK" -ForegroundColor Cyan
Write-Host " Proyecto verificado: chatmigra-ztgg" -ForegroundColor White
Write-Host ""

if (!(Test-Path $ProjectRoot)) {
    throw "No existe el proyecto: $ProjectRoot"
}

Set-Location $ProjectRoot

# ============================================================
# 1. VALIDAR REPOSITORIO
# ============================================================

Section "1. VALIDANDO QUE ESTAMOS EN CHATMI"

if (!(Test-Path ".git")) {

    throw "Esta carpeta no contiene un repositorio Git."
}

$Remote = (
    git remote get-url origin 2>$null
).Trim()

Write-Host "Git remote:" -ForegroundColor Gray
Write-Host "  $Remote" -ForegroundColor White

if (
    $Remote -notmatch
    [regex]::Escape($ExpectedGitRemote)
) {

    throw @"
REPOSITORIO INCORRECTO.

Esperado:
$ExpectedGitRemote

Encontrado:
$Remote

No se realizará ningún vínculo.
"@
}

OK "Repositorio ChatMi confirmado."

$Branch = (
    git branch --show-current
).Trim()

Write-Host ""
Write-Host "Rama actual: $Branch" -ForegroundColor Gray

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP ANTES DE VINCULAR"

New-Item `
    -ItemType Directory `
    -Path $BackupRoot `
    -Force |
    Out-Null

if (Test-Path $VercelFolder) {

    Copy-Item `
        $VercelFolder `
        (Join-Path $BackupRoot ".vercel") `
        -Recurse `
        -Force
}

if (Test-Path $EnvLocal) {

    Copy-Item `
        $EnvLocal `
        (Join-Path $BackupRoot ".env.local") `
        -Force
}

if (Test-Path $EnvDevelopmentLocal) {

    Copy-Item `
        $EnvDevelopmentLocal `
        (Join-Path $BackupRoot ".env.development.local") `
        -Force
}

OK "Backup:"
Write-Host "  $BackupRoot" -ForegroundColor DarkGray

# ============================================================
# 3. COMPROBAR LOGIN VERCEL
# ============================================================

Section "3. VALIDANDO CUENTA VERCEL"

$WhoAmI = (
    vercel whoami 2>&1 |
    Out-String
)

Write-Host $WhoAmI.Trim()

if (
    $WhoAmI -notmatch
    "mateomaralcantara"
) {

    Warn "No pude confirmar mateomaralcantara automáticamente."
}

# ============================================================
# 4. INSPECCIONAR PROYECTO REMOTO ANTES DE LINK
# ============================================================

Section "4. VERIFICANDO PROYECTO REMOTO"

$InspectBefore = (
    vercel project inspect `
        $ExpectedProjectName `
        --scope $ExpectedScope `
        2>&1 |
    Out-String
)

Write-Host $InspectBefore.Trim()

if (
    $InspectBefore -notmatch
    [regex]::Escape($ExpectedProjectId)
) {

    throw @"
SEGURIDAD: EL PROJECT ID NO COINCIDE.

Esperado:
$ExpectedProjectId

No vincularé esta carpeta.
"@
}

if (
    $InspectBefore -notmatch
    [regex]::Escape($ExpectedProjectName)
) {

    throw "No pude confirmar el nombre del proyecto Vercel."
}

OK "Proyecto remoto correcto."

# ============================================================
# 5. LIMPIAR VINCULO LOCAL INCOMPLETO SI EXISTE
# ============================================================

Section "5. PREPARANDO VINCULO LOCAL"

if (Test-Path $ProjectJson) {

    $Existing = Get-Content `
        $ProjectJson `
        -Raw |
        ConvertFrom-Json

    if (
        $Existing.projectId -eq $ExpectedProjectId -and
        $Existing.orgId -eq $ExpectedOrgId
    ) {

        OK "La carpeta ya está vinculada al proyecto correcto."
    }
    else {

        Warn "Existe un vínculo diferente."

        Write-Host "Project actual: $($Existing.projectId)"
        Write-Host "Org actual    : $($Existing.orgId)"

        Remove-Item `
            $VercelFolder `
            -Recurse `
            -Force

        OK "Vínculo local incorrecto eliminado."
    }
}
else {

    OK "No existe vínculo previo."
}

# ============================================================
# 6. LINK EXPLICITO
# ============================================================

Section "6. VINCULANDO CHATMI A VERCEL"

if (!(Test-Path $ProjectJson)) {

    & vercel link `
        --yes `
        --project $ExpectedProjectName `
        --scope $ExpectedScope

    if ($LASTEXITCODE -ne 0) {

        throw "vercel link falló."
    }
}

if (!(Test-Path $ProjectJson)) {

    throw ".vercel\project.json no fue creado."
}

$Linked = Get-Content `
    $ProjectJson `
    -Raw |
    ConvertFrom-Json

Write-Host ""
Write-Host "PROJECT ID:" -ForegroundColor Gray
Write-Host "  $($Linked.projectId)" -ForegroundColor Cyan

Write-Host "ORG ID:" -ForegroundColor Gray
Write-Host "  $($Linked.orgId)" -ForegroundColor Cyan

# ============================================================
# 7. CONTROL ANTIVINCULO EQUIVOCADO
# ============================================================

Section "7. CONTROL DE IDENTIDAD"

if ($Linked.projectId -ne $ExpectedProjectId) {

    throw @"
VINCULO INCORRECTO DETECTADO.

Esperado:
$ExpectedProjectId

Obtenido:
$($Linked.projectId)

DETENIDO.
"@
}

if ($Linked.orgId -ne $ExpectedOrgId) {

    throw @"
TEAM INCORRECTO DETECTADO.

Esperado:
$ExpectedOrgId

Obtenido:
$($Linked.orgId)

DETENIDO.
"@
}

OK "Project ID exacto."
OK "Team ID exacto."
OK "ChatMi vinculado exclusivamente a chatmigra-ztgg."

# ============================================================
# 8. INSPECCION POST-LINK
# ============================================================

Section "8. CONFIRMANDO PROYECTO VINCULADO"

$InspectLinked = (
    vercel project inspect `
        --non-interactive `
        2>&1 |
    Out-String
)

Write-Host $InspectLinked.Trim()

if (
    $InspectLinked -notmatch
    [regex]::Escape($ExpectedProjectName)
) {

    throw "La inspección posterior no resolvió chatmigra-ztgg."
}

OK "Vercel CLI resuelve el proyecto correcto."

# ============================================================
# 9. DESCARGAR VARIABLES DEVELOPMENT
# ============================================================

Section "9. SINCRONIZANDO VARIABLES DE DESARROLLO"

Write-Host ""
Write-Host "Descargando variables del proyecto..." -ForegroundColor Gray

& vercel env pull `
    ".env.local" `
    --environment=development `
    --yes

if ($LASTEXITCODE -ne 0) {

    Warn "vercel env pull devolvió error."

    if (!(Test-Path $EnvLocal)) {

        throw "No existe .env.local después del env pull."
    }
}

OK "Variables de Vercel disponibles localmente."

# ============================================================
# 10. FORZAR MISMO ORIGEN EN DESARROLLO
# ============================================================

Section "10. FIJANDO API LOCAL EN PUERTO 3000"

# Corrigimos también .env.local por si Vercel tiene guardado
# un antiguo VITE_API_BASE apuntando a :3001.

Set-EnvValue `
    -Path $EnvLocal `
    -Name "VITE_API_BASE" `
    -Value "http://localhost:3000"

Set-EnvValue `
    -Path $EnvDevelopmentLocal `
    -Name "VITE_API_BASE" `
    -Value "http://localhost:3000"

OK ".env.local -> VITE_API_BASE=http://localhost:3000"
OK ".env.development.local -> VITE_API_BASE=http://localhost:3000"

# ============================================================
# 11. COMPROBAR API FILES
# ============================================================

Section "11. VALIDANDO VERCEL FUNCTIONS"

$RequiredApis = @(
    "api\gemini.ts",
    "api\gemini-ephemeral-token.ts",
    "api\image-search.ts"
)

foreach ($Relative in $RequiredApis) {

    $FullPath = Join-Path $ProjectRoot $Relative

    if (!(Test-Path $FullPath)) {

        throw "Falta: $Relative"
    }

    OK $Relative
}

# ============================================================
# 12. TYPESCRIPT
# ============================================================

Section "12. TYPESCRIPT"

$TscLog = Join-Path `
    $env:TEMP `
    "chatmi-delegado-tsc-$PID.txt"

& npx tsc --noEmit *> $TscLog

$TscCode = $LASTEXITCODE

if ($TscCode -ne 0) {

    Get-Content $TscLog |
        Select-Object -Last 100

    Remove-Item `
        $TscLog `
        -Force `
        -ErrorAction SilentlyContinue

    throw "TypeScript falló antes de levantar Vercel."
}

Remove-Item `
    $TscLog `
    -Force `
    -ErrorAction SilentlyContinue

OK "TypeScript: 0 errores."

# ============================================================
# 13. LIBERAR PUERTO 3000
# ============================================================

Section "13. PREPARANDO PUERTO 3000"

$Pids = @(Get-PortPids $Port)

if ($Pids.Count -gt 0) {

    Warn "Puerto 3000 ocupado."

    foreach ($PidNumber in $Pids) {

        try {

            $Process = Get-Process `
                -Id $PidNumber `
                -ErrorAction Stop

            Write-Host (
                "PID {0} - {1}" -f
                $PidNumber,
                $Process.ProcessName
            )

            if (
                $Process.ProcessName -match
                "node|npm|vercel"
            ) {

                Stop-Process `
                    -Id $PidNumber `
                    -Force

                OK "Proceso anterior detenido."
            }
            else {

                throw (
                    "Puerto 3000 ocupado por " +
                    "$($Process.ProcessName)."
                )
            }
        }
        catch {

            if (
                $_.Exception.Message -match
                "Puerto 3000 ocupado"
            ) {

                throw
            }
        }
    }

    Start-Sleep -Seconds 2
}

if (Test-Port $Port) {

    throw "El puerto 3000 continúa ocupado."
}

OK "Puerto 3000 libre."

# ============================================================
# 14. CREAR LANZADOR PERMANENTE
# ============================================================

Section "14. CREANDO LANZADOR PERMANENTE"

$LauncherPath = Join-Path `
    $ProjectRoot `
    "INICIAR-CHATMI.ps1"

$Launcher = @'
$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"

Set-Location $ProjectRoot

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " CHATMI FULL STACK" -ForegroundColor Cyan
Write-Host " http://localhost:3000" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

vercel dev --listen 3000
'@

Set-Content `
    -LiteralPath $LauncherPath `
    -Value $Launcher `
    -Encoding UTF8

OK "Creado:"
Write-Host "  $LauncherPath" -ForegroundColor Cyan

# ============================================================
# 15. LEVANTAR VERCEL DEV
# ============================================================

Section "15. LEVANTANDO CHATMI FULL STACK"

$LaunchCommand = @"
Set-Location '$ProjectRoot'

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' CHATMI - VERCEL DEV - PUERTO 3000' -ForegroundColor Cyan
Write-Host ' Proyecto: chatmigra-ztgg' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ''

vercel dev --listen 3000
"@

Start-Process `
    powershell.exe `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $LaunchCommand
    )

Write-Host ""
Write-Host "Esperando servidor..." -ForegroundColor Gray

if (!(Wait-Port -TargetPort 3000 -Attempts 60)) {

    throw @"
Vercel Dev no abrió el puerto 3000.

Mira la nueva ventana de PowerShell:
allí estará el error real de Vercel Dev.
"@
}

OK "Puerto 3000 activo."

# ============================================================
# 16. FRONTEND
# ============================================================

Section "16. PROBANDO FRONTEND"

$RootStatus = Get-HttpStatus `
    -Url "http://localhost:3000/" `
    -Method "GET"

Write-Host "GET / -> HTTP $RootStatus"

if (
    $RootStatus -lt 200 -or
    $RootStatus -ge 500
) {

    throw "Frontend no responde correctamente."
}

OK "Frontend ChatMi alcanzable."

# ============================================================
# 17. GEMINI TEXTO
# ============================================================

Section "17. PROBANDO GEMINI"

Assert-ApiRoute `
    -Name "/api/gemini" `
    -Url "http://localhost:3000/api/gemini"

# ============================================================
# 18. GEMINI LIVE / VOZ
# ============================================================

Section "18. PROBANDO GEMINI LIVE"

Assert-ApiRoute `
    -Name "/api/gemini-ephemeral-token" `
    -Url "http://localhost:3000/api/gemini-ephemeral-token"

# ============================================================
# 19. IMAGE SEARCH
# ============================================================

Section "19. PROBANDO IMAGE SEARCH"

Assert-ApiRoute `
    -Name "/api/image-search" `
    -Url "http://localhost:3000/api/image-search"

# ============================================================
# 20. RESULTADO FINAL
# ============================================================

Section "DELEGACION COMPLETADA"

Write-Host ""
Write-Host "PROYECTO LOCAL" -ForegroundColor White
Write-Host "  $ProjectRoot" -ForegroundColor Cyan

Write-Host ""
Write-Host "GITHUB" -ForegroundColor White
Write-Host "  mateomaralcantara/Chatmigra" -ForegroundColor Cyan

Write-Host ""
Write-Host "VERCEL" -ForegroundColor White
Write-Host "  chatmigra-ztgg" -ForegroundColor Cyan
Write-Host "  $ExpectedProjectId" -ForegroundColor DarkGray

Write-Host ""
Write-Host "TEAM" -ForegroundColor White
Write-Host "  monseoweb-project" -ForegroundColor Cyan
Write-Host "  $ExpectedOrgId" -ForegroundColor DarkGray

Write-Host ""
Write-Host "LOCAL" -ForegroundColor White
Write-Host "  http://localhost:3000" -ForegroundColor Green

Write-Host ""
Write-Host "RUTAS" -ForegroundColor White
Write-Host "  /api/gemini" -ForegroundColor Green
Write-Host "  /api/gemini-ephemeral-token" -ForegroundColor Green
Write-Host "  /api/image-search" -ForegroundColor Green

Write-Host ""
Write-Host "LANZADOR FUTURO" -ForegroundColor White
Write-Host "  .\INICIAR-CHATMI.ps1" -ForegroundColor Cyan

Write-Host ""
Write-Host ("=" * 100) -ForegroundColor Green
Write-Host " CHATMI LOCAL + VERCEL FUNCTIONS DELEGADO CORRECTAMENTE" -ForegroundColor Green
Write-Host ("=" * 100) -ForegroundColor Green