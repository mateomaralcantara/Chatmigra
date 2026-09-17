param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [int]$ApiPort = 3001
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 96) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 96) -ForegroundColor DarkGray
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

function Test-Port {
    param([int]$Port)

    try {
        $result = Test-NetConnection `
            -ComputerName "127.0.0.1" `
            -Port $Port `
            -WarningAction SilentlyContinue

        return [bool]$result.TcpTestSucceeded
    }
    catch {
        return $false
    }
}

function Test-HttpServer {
    param([string]$Url)

    try {
        Invoke-WebRequest `
            -Uri $Url `
            -Method GET `
            -TimeoutSec 5 `
            -UseBasicParsing |
            Out-Null

        return $true
    }
    catch {
        # 404, 405, 401, etc. significan que HAY servidor HTTP.
        if ($_.Exception.Response) {
            return $true
        }

        return $false
    }
}

function Wait-Port {
    param(
        [int]$Port,
        [int]$Attempts = 30
    )

    for ($i = 1; $i -le $Attempts; $i++) {

        if (Test-Port $Port) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

Clear-Host

Write-Host ""
Write-Host " CHATMI — REPARACION API GEMINI / PUERTO 3001" -ForegroundColor Cyan
Write-Host " Detecta y levanta el backend local correcto" -ForegroundColor White
Write-Host ""

if (!(Test-Path $ProjectRoot)) {
    throw "No existe: $ProjectRoot"
}

Set-Location $ProjectRoot

$PackageFile = Join-Path $ProjectRoot "package.json"

if (!(Test-Path $PackageFile)) {
    throw "No existe package.json."
}

# ============================================================
# 1. ESTADO ACTUAL
# ============================================================

Section "1. ESTADO DEL PUERTO 3001"

$PortOpen = Test-Port $ApiPort

if ($PortOpen) {

    OK "El puerto $ApiPort YA está escuchando."
}
else {

    Fail "No existe ningún servidor escuchando en $ApiPort."
    Write-Host ""
    Write-Host "Esto explica directamente:" -ForegroundColor Yellow
    Write-Host "  ERR_CONNECTION_REFUSED"
    Write-Host "  /api/gemini"
    Write-Host "  /api/gemini-ephemeral-token"
}

# ============================================================
# 2. BUSCAR REFERENCIAS A 3001 / GEMINI
# ============================================================

Section "2. LOCALIZANDO CONFIGURACION GEMINI"

$CodeExtensions = @(
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json"
)

$SearchRoots = @(
    (Join-Path $ProjectRoot "src"),
    (Join-Path $ProjectRoot "api"),
    (Join-Path $ProjectRoot "server")
) |
Where-Object {
    Test-Path $_
}

$Matches = @()

foreach ($Root in $SearchRoots) {

    $Matches += @(
        Get-ChildItem `
            -LiteralPath $Root `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in $CodeExtensions
        } |
        Select-String `
            -Pattern @(
                "3001",
                "/api/gemini",
                "gemini-ephemeral-token"
            ) `
            -SimpleMatch `
            -ErrorAction SilentlyContinue
    )
}

if ($Matches.Count -gt 0) {

    OK "Referencias encontradas."

    $Matches |
        Select-Object `
            Path,
            LineNumber,
            Line |
        Format-Table `
            -AutoSize
}
else {

    Warn "No encontré referencias explícitas en src/api/server."
}

# ============================================================
# 3. ANALIZAR PACKAGE.JSON
# ============================================================

Section "3. ANALIZANDO SCRIPTS DEL PROYECTO"

$Package = Get-Content `
    -LiteralPath $PackageFile `
    -Raw |
    ConvertFrom-Json

$Scripts = @{}

if ($Package.scripts) {

    foreach ($Property in $Package.scripts.PSObject.Properties) {
        $Scripts[$Property.Name] = [string]$Property.Value
    }
}

if ($Scripts.Count -eq 0) {

    Warn "package.json no contiene scripts."
}
else {

    foreach ($Name in ($Scripts.Keys | Sort-Object)) {

        Write-Host (
            "{0,-22} {1}" -f
            $Name,
            $Scripts[$Name]
        )
    }
}

# ============================================================
# 4. DETECTAR BACKEND
# ============================================================

Section "4. DETECTANDO BACKEND"

$ApiDirectory = Join-Path $ProjectRoot "api"

$ServerFiles = @(
    "server.ts",
    "server.js",
    "server.mjs",
    "server.cjs",
    "api-server.ts",
    "api-server.js"
) |
ForEach-Object {
    Join-Path $ProjectRoot $_
} |
Where-Object {
    Test-Path $_
}

$CandidateScript = $null

$PreferredNames = @(
    "dev:api",
    "api:dev",
    "dev:server",
    "server:dev",
    "backend:dev",
    "dev:backend",
    "api",
    "server",
    "backend"
)

foreach ($Name in $PreferredNames) {

    if ($Scripts.ContainsKey($Name)) {
        $CandidateScript = $Name
        break
    }
}

if ($CandidateScript) {

    OK "Backend npm detectado: npm run $CandidateScript"
}
elseif (Test-Path $ApiDirectory) {

    OK "Carpeta /api detectada."
    Write-Host "Se tratará como API serverless compatible con Vercel."
}
elseif ($ServerFiles.Count -gt 0) {

    OK "Archivo servidor detectado:"
    $ServerFiles | ForEach-Object {
        Write-Host "  $_"
    }
}
else {

    Warn "No encontré un launcher backend evidente."
}

# ============================================================
# 5. MOSTRAR ENDPOINTS API
# ============================================================

Section "5. COMPROBANDO ENDPOINTS EXISTENTES"

if (Test-Path $ApiDirectory) {

    $ApiFiles = @(
        Get-ChildItem `
            -LiteralPath $ApiDirectory `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue
    )

    if ($ApiFiles.Count -gt 0) {

        $ApiFiles |
            ForEach-Object {

                Write-Host (
                    "  {0}" -f
                    $_.FullName.Replace(
                        "$ProjectRoot\",
                        ""
                    )
                )
            }
    }
    else {

        Warn "La carpeta api está vacía."
    }
}
else {

    Warn "No existe carpeta raíz /api."
}

# ============================================================
# 6. SI 3001 YA FUNCIONA, NO DUPLICAR
# ============================================================

if (Test-Port $ApiPort) {

    Section "6. BACKEND YA ACTIVO"

    OK "No iniciaré otro proceso en $ApiPort."

}
else {

    # ========================================================
    # 7. INTENTAR LEVANTAR BACKEND
    # ========================================================

    Section "6. LEVANTANDO BACKEND"

    $Started = $false

    # --------------------------------------------------------
    # OPCION A — SCRIPT NPM EXPLICITO
    # --------------------------------------------------------

    if ($CandidateScript) {

        Write-Host ""
        Write-Host "Iniciando:" -ForegroundColor Cyan
        Write-Host "  npm run $CandidateScript" -ForegroundColor White

        $Command = @"
Set-Location '$ProjectRoot'
`$env:PORT='$ApiPort'
npm run $CandidateScript
"@

        Start-Process `
            powershell.exe `
            -ArgumentList @(
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                $Command
            )

        if (Wait-Port $ApiPort 20) {

            $Started = $true

            OK "Backend levantado mediante npm run $CandidateScript."
        }
        else {

            Warn "Ese script no abrió el puerto $ApiPort."
        }
    }

    # --------------------------------------------------------
    # OPCION B — VERCEL SERVERLESS API
    # --------------------------------------------------------

    if (
        !$Started -and
        (Test-Path $ApiDirectory)
    ) {

        Write-Host ""
        Write-Host "Probando Vercel Dev para /api..." -ForegroundColor Cyan

        $Command = @"
Set-Location '$ProjectRoot'
npx vercel dev --listen $ApiPort
"@

        Start-Process `
            powershell.exe `
            -ArgumentList @(
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                $Command
            )

        if (Wait-Port $ApiPort 30) {

            $Started = $true

            OK "API serverless levantada en puerto $ApiPort."
        }
        else {

            Warn "Vercel Dev no abrió el puerto $ApiPort."
        }
    }

    # --------------------------------------------------------
    # OPCION C — ARCHIVO SERVER
    # --------------------------------------------------------

    if (
        !$Started -and
        $ServerFiles.Count -gt 0
    ) {

        $ServerFile = $ServerFiles[0]

        Write-Host ""
        Write-Host "Probando servidor directo:" -ForegroundColor Cyan
        Write-Host "  $ServerFile"

        $Extension = [IO.Path]::GetExtension($ServerFile)

        if ($Extension -eq ".ts") {

            $RunServer = "npx tsx `"$ServerFile`""
        }
        else {

            $RunServer = "node `"$ServerFile`""
        }

        $Command = @"
Set-Location '$ProjectRoot'
`$env:PORT='$ApiPort'
$RunServer
"@

        Start-Process `
            powershell.exe `
            -ArgumentList @(
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                $Command
            )

        if (Wait-Port $ApiPort 20) {

            $Started = $true

            OK "Servidor abierto en $ApiPort."
        }
    }

    # --------------------------------------------------------
    # RESULTADO
    # --------------------------------------------------------

    if (!$Started) {

        Section "BACKEND NO PUDO INICIARSE AUTOMATICAMENTE"

        Fail "Sigue sin existir servidor en localhost:$ApiPort."

        Write-Host ""
        Write-Host "No modificaré Gemini a ciegas." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "El diagnóstico anterior muestra:" -ForegroundColor White
        Write-Host "  - scripts disponibles"
        Write-Host "  - referencias al puerto 3001"
        Write-Host "  - endpoints encontrados"
        Write-Host "  - estructura /api"
        Write-Host ""

        throw "Falta un backend ejecutable para las rutas Gemini."
    }
}

# ============================================================
# 8. VALIDAR CONECTIVIDAD
# ============================================================

Section "7. VALIDANDO SERVIDOR HTTP"

$BaseUrl = "http://127.0.0.1:$ApiPort"

if (Test-HttpServer $BaseUrl) {

    OK "Servidor HTTP responde en $BaseUrl"
}
else {

    throw "El puerto está abierto pero no responde como servidor HTTP."
}

# ============================================================
# 9. PROBAR GEMINI
# ============================================================

Section "8. VALIDANDO RUTAS GEMINI"

$GeminiUrl =
    "$BaseUrl/api/gemini"

$EphemeralUrl =
    "$BaseUrl/api/gemini-ephemeral-token"

if (Test-HttpServer $GeminiUrl) {

    OK "/api/gemini es alcanzable."
}
else {

    Fail "/api/gemini sigue sin ser alcanzable."
}

if (Test-HttpServer $EphemeralUrl) {

    OK "/api/gemini-ephemeral-token es alcanzable."
}
else {

    Fail "/api/gemini-ephemeral-token sigue sin ser alcanzable."
}

# ============================================================
# 10. TYPESCRIPT
# ============================================================

Section "9. CONFIRMANDO FRONTEND"

$TscLog =
    Join-Path `
        $env:TEMP `
        "chatmi-api-repair-tsc-$PID.txt"

& npx tsc --noEmit *> $TscLog

$TscCode = $LASTEXITCODE

if ($TscCode -eq 0) {

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

Section "RESULTADO"

if (Test-Port $ApiPort) {

    OK "PUERTO $ApiPort ACTIVO"
    OK "Backend Gemini disponible"

    Write-Host ""
    Write-Host "Ahora vuelve al navegador y recarga:" -ForegroundColor White
    Write-Host ""
    Write-Host "  Ctrl + Shift + R" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Luego prueba:" -ForegroundColor White
    Write-Host "  1. Un mensaje de texto"
    Write-Host "  2. Iniciar voz"
}
else {

    Fail "El puerto $ApiPort continúa cerrado."
}