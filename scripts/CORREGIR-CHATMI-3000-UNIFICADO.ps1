param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$EnvDevelopmentLocal = Join-Path $ProjectRoot ".env.development.local"
$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\api-3000-$Stamp"

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

    $lines = @()

    if (Test-Path $Path) {
        $lines = @(Get-Content -LiteralPath $Path)
    }

    $found = $false

    $newLines = foreach ($line in $lines) {

        if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {

            "$Name=$Value"
            $found = $true
        }
        else {
            $line
        }
    }

    if (!$found) {

        $newLines = @(
            $newLines
            "$Name=$Value"
        )
    }

    Set-Content `
        -LiteralPath $Path `
        -Value $newLines `
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

function Get-HttpStatus {
    param([string]$Url)

    try {

        $response = Invoke-WebRequest `
            -Uri $Url `
            -Method GET `
            -UseBasicParsing `
            -TimeoutSec 8

        return [int]$response.StatusCode
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

function Wait-ForPort {
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

Clear-Host

Write-Host ""
Write-Host " CHATMI — UNIFICACION TOTAL EN PUERTO 3000" -ForegroundColor Cyan
Write-Host " Vite + Vercel Functions + Gemini + Gemini Live" -ForegroundColor White
Write-Host ""

if (!(Test-Path $ProjectRoot)) {
    throw "No existe el proyecto: $ProjectRoot"
}

Set-Location $ProjectRoot

# ============================================================
# 1. VERIFICAR API
# ============================================================

Section "1. VERIFICANDO API REAL"

$RequiredApiFiles = @(
    "api\gemini.ts",
    "api\gemini-ephemeral-token.ts"
)

foreach ($relative in $RequiredApiFiles) {

    $path = Join-Path $ProjectRoot $relative

    if (!(Test-Path $path)) {
        throw "Falta endpoint requerido: $relative"
    }

    OK $relative
}

if (Test-Path (Join-Path $ProjectRoot "api\image-search.ts")) {
    OK "api\image-search.ts"
}

# ============================================================
# 2. BACKUP
# ============================================================

Section "2. BACKUP"

New-Item `
    -ItemType Directory `
    -Path $BackupRoot `
    -Force |
    Out-Null

if (Test-Path $EnvDevelopmentLocal) {

    Copy-Item `
        $EnvDevelopmentLocal `
        (Join-Path $BackupRoot ".env.development.local") `
        -Force
}

OK "Backup creado:"
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. FIJAR BASE API A 3000
# ============================================================

Section "3. CORRIGIENDO VITE_API_BASE"

Set-EnvValue `
    -Path $EnvDevelopmentLocal `
    -Name "VITE_API_BASE" `
    -Value "http://localhost:3000"

OK "VITE_API_BASE=http://localhost:3000"

Write-Host ""
Write-Host "Archivo:" -ForegroundColor Gray
Write-Host "  $EnvDevelopmentLocal" -ForegroundColor DarkGray

# ============================================================
# 4. BUSCAR REFERENCIAS ACTIVAS A 3001
# ============================================================

Section "4. COMPROBANDO REFERENCIAS A 3001"

$SourceFiles = @(
    Get-ChildItem `
        (Join-Path $ProjectRoot "src") `
        -Recurse `
        -File `
        -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Extension -in ".ts", ".tsx", ".js", ".jsx"
    }
)

$Port3001Matches = @(
    $SourceFiles |
    Select-String `
        -Pattern "localhost:3001" `
        -SimpleMatch `
        -ErrorAction SilentlyContinue
)

if ($Port3001Matches.Count -gt 0) {

    Warn "Hay referencias fallback a 3001 en el código."

    foreach ($match in $Port3001Matches) {

        Write-Host (
            "  {0}:{1}" -f
            $match.Path.Replace("$ProjectRoot\", ""),
            $match.LineNumber
        ) -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "No son problema mientras VITE_API_BASE=3000 tenga prioridad." -ForegroundColor Yellow
}
else {

    OK "No quedan referencias a localhost:3001."
}

# ============================================================
# 5. IDENTIFICAR PROCESO ACTUAL EN 3000
# ============================================================

Section "5. PROCESO ACTUAL EN PUERTO 3000"

$CurrentPids = @(Get-PortPids $Port)

if ($CurrentPids.Count -eq 0) {

    Warn "Actualmente nadie escucha en $Port."
}
else {

    foreach ($PidNumber in $CurrentPids) {

        try {

            $process = Get-Process `
                -Id $PidNumber `
                -ErrorAction Stop

            Write-Host (
                "PID {0}  {1}" -f
                $PidNumber,
                $process.ProcessName
            ) -ForegroundColor Yellow
        }
        catch {
        }
    }
}

# ============================================================
# 6. CERRAR VITE ACTUAL
# ============================================================

Section "6. CERRANDO SERVIDOR FRONTEND ACTUAL"

foreach ($PidNumber in $CurrentPids) {

    try {

        $process = Get-Process `
            -Id $PidNumber `
            -ErrorAction Stop

        if (
            $process.ProcessName -match
            "node|npm|vite|pwsh|powershell"
        ) {

            Write-Host (
                "Cerrando PID {0} ({1})..." -f
                $PidNumber,
                $process.ProcessName
            ) -ForegroundColor Yellow

            Stop-Process `
                -Id $PidNumber `
                -Force `
                -ErrorAction SilentlyContinue
        }
        else {

            Warn (
                "PID $PidNumber no parece Node/Vite. " +
                "No se cerrará automáticamente."
            )
        }
    }
    catch {
    }
}

Start-Sleep -Seconds 2

if (Test-Port $Port) {

    throw (
        "El puerto $Port continúa ocupado por un proceso " +
        "que no cerraré automáticamente."
    )
}

OK "Puerto 3000 disponible."

# ============================================================
# 7. DETECTAR VERCEL CLI
# ============================================================

Section "7. PREPARANDO VERCEL DEV"

$Vercel = Get-Command `
    vercel `
    -ErrorAction SilentlyContinue

if ($Vercel) {

    $LaunchCommand = @"
Set-Location '$ProjectRoot'
Write-Host ''
Write-Host 'CHATMI FULL STACK - PUERTO 3000' -ForegroundColor Cyan
Write-Host ''
vercel dev --listen 3000
"@

    OK "Vercel CLI instalado."
}
else {

    Warn "Vercel CLI global no encontrado."
    Write-Host "Se utilizará npx." -ForegroundColor Gray

    $LaunchCommand = @"
Set-Location '$ProjectRoot'
Write-Host ''
Write-Host 'CHATMI FULL STACK - PUERTO 3000' -ForegroundColor Cyan
Write-Host ''
npx --yes vercel@latest dev --listen 3000
"@
}

# ============================================================
# 8. LEVANTAR CHATMI FULL STACK
# ============================================================

Section "8. LEVANTANDO CHATMI COMPLETO"

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
Write-Host "Buscando servidor unificado en 3000..." -ForegroundColor Gray

$Started = Wait-ForPort `
    -TargetPort $Port `
    -Attempts 60

if (!$Started) {

    Fail "El servidor no abrió el puerto 3000."

    Write-Host ""
    Write-Host "Mira la nueva ventana de PowerShell." -ForegroundColor Yellow
    Write-Host "Si Vercel pide login/link, completa ese proceso allí."

    throw "ChatMi Full Stack todavía no está levantado."
}

OK "Puerto 3000 activo."

# ============================================================
# 9. VALIDAR FRONTEND
# ============================================================

Section "9. VALIDANDO FRONTEND"

$RootStatus = Get-HttpStatus `
    "http://localhost:3000/"

Write-Host "HTTP / : $RootStatus"

if (
    $RootStatus -ge 200 -and
    $RootStatus -lt 500
) {

    OK "Frontend responde."
}
else {

    throw "El frontend no responde correctamente."
}

# ============================================================
# 10. VALIDAR GEMINI API
# ============================================================

Section "10. VALIDANDO /api/gemini"

$GeminiStatus = Get-HttpStatus `
    "http://localhost:3000/api/gemini"

Write-Host "HTTP /api/gemini : $GeminiStatus"

if ($GeminiStatus -eq 0) {

    throw "/api/gemini no es alcanzable."
}

if ($GeminiStatus -eq 404) {

    throw "/api/gemini devuelve 404."
}

if ($GeminiStatus -eq 405) {

    OK "/api/gemini existe. GET no permitido es normal para una ruta POST."
}
elseif (
    $GeminiStatus -ge 200 -and
    $GeminiStatus -lt 500
) {

    OK "/api/gemini alcanzable."
}
else {

    Warn "/api/gemini responde HTTP $GeminiStatus."
}

# ============================================================
# 11. VALIDAR GEMINI LIVE
# ============================================================

Section "11. VALIDANDO GEMINI LIVE"

$LiveStatus = Get-HttpStatus `
    "http://localhost:3000/api/gemini-ephemeral-token"

Write-Host "HTTP /api/gemini-ephemeral-token : $LiveStatus"

if ($LiveStatus -eq 0) {

    throw "/api/gemini-ephemeral-token no es alcanzable."
}

if ($LiveStatus -eq 404) {

    throw "/api/gemini-ephemeral-token devuelve 404."
}

if ($LiveStatus -eq 405) {

    OK (
        "/api/gemini-ephemeral-token existe. " +
        "GET no permitido puede ser normal."
    )
}
elseif (
    $LiveStatus -ge 200 -and
    $LiveStatus -lt 500
) {

    OK "/api/gemini-ephemeral-token alcanzable."
}
else {

    Warn (
        "/api/gemini-ephemeral-token responde HTTP " +
        "$LiveStatus."
    )
}

# ============================================================
# 12. TYPESCRIPT
# ============================================================

Section "12. TYPESCRIPT"

$TscLog = Join-Path `
    $env:TEMP `
    "chatmi-3000-tsc-$PID.txt"

& npx tsc --noEmit *> $TscLog

$TscExitCode = $LASTEXITCODE

if ($TscExitCode -eq 0) {

    OK "TypeScript: 0 errores."
}
else {

    Fail "TypeScript presenta errores."

    Get-Content $TscLog |
        Select-Object -Last 80
}

Remove-Item `
    $TscLog `
    -Force `
    -ErrorAction SilentlyContinue

# ============================================================
# FINAL
# ============================================================

Section "CHATMI 3000 — RESULTADO"

Write-Host ""
Write-Host "Arquitectura local:" -ForegroundColor White

Write-Host ""
Write-Host " http://localhost:3000" -ForegroundColor Cyan
Write-Host "          |"
Write-Host "          +-- Frontend Vite / React"
Write-Host "          |"
Write-Host "          +-- /api/gemini"
Write-Host "          |"
Write-Host "          +-- /api/gemini-ephemeral-token"
Write-Host "          |"
Write-Host "          +-- /api/image-search"

Write-Host ""

if (
    (Test-Port 3000) -and
    $GeminiStatus -ne 0 -and
    $GeminiStatus -ne 404 -and
    $LiveStatus -ne 0 -and
    $LiveStatus -ne 404
) {

    Write-Host ("=" * 100) -ForegroundColor Green
    Write-Host " CHATMI FULL STACK — PUERTO 3000 CORRECTO" -ForegroundColor Green
    Write-Host ("=" * 100) -ForegroundColor Green

    Write-Host ""
    Write-Host "Recarga el navegador con:" -ForegroundColor White
    Write-Host "  Ctrl + Shift + R" -ForegroundColor Cyan
}
else {

    Warn "Todavía existe alguna ruta pendiente."
}