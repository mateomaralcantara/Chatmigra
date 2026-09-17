param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi",
    [switch]$RunBuild = $true,
    [switch]$RunAudit = $true
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# ============================================================
# CHATMI — SCANNER PROFESIONAL 1/10
# ============================================================

$ScriptVersion = "1.0.0"
$StartedAt = Get-Date
$Results = New-Object System.Collections.Generic.List[object]

function Write-Title([string]$Text) {
    Write-Host ""
    Write-Host ("=" * 90) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 90) -ForegroundColor DarkGray
}

function Add-Result {
    param(
        [string]$Category,
        [string]$Check,
        [ValidateSet("PASS","WARN","FAIL","INFO")]
        [string]$Status,
        [double]$Points,
        [double]$MaxPoints,
        [string]$Detail = ""
    )

    $Results.Add([PSCustomObject]@{
        Category  = $Category
        Check     = $Check
        Status    = $Status
        Points    = $Points
        MaxPoints = $MaxPoints
        Detail    = $Detail
    }) | Out-Null

    $icon = switch ($Status) {
        "PASS" { "[OK]" }
        "WARN" { "[!]" }
        "FAIL" { "[X]" }
        "INFO" { "[i]" }
    }

    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        "INFO" { "Cyan" }
    }

    Write-Host ("{0,-5} {1}" -f $icon, $Check) -ForegroundColor $color

    if ($Detail) {
        Write-Host "      $Detail" -ForegroundColor DarkGray
    }
}

function Get-Files {
    param([string[]]$Extensions)

    if (!(Test-Path $ProjectRoot)) {
        return @()
    }

    return @(
        Get-ChildItem -Path $ProjectRoot -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch "\\node_modules\\" -and
            $_.FullName -notmatch "\\dist\\" -and
            $_.FullName -notmatch "\\build\\" -and
            $_.FullName -notmatch "\\coverage\\" -and
            $_.Extension -in $Extensions
        }
    )
}

function Search-Code {
    param(
        [string]$Pattern,
        [switch]$SimpleMatch
    )

    $files = Get-Files @(".ts",".tsx",".js",".jsx",".mjs",".cjs",".sql")

    if ($files.Count -eq 0) {
        return @()
    }

    try {
        if ($SimpleMatch) {
            return @(
                $files |
                Select-String -SimpleMatch -Pattern $Pattern -ErrorAction SilentlyContinue
            )
        }

        return @(
            $files |
            Select-String -Pattern $Pattern -ErrorAction SilentlyContinue
        )
    }
    catch {
        return @()
    }
}

function Test-CommandExists([string]$Command) {
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Read-FileSafe([string]$Path) {
    if (!(Test-Path $Path)) {
        return ""
    }

    try {
        return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
    }
    catch {
        return ""
    }
}


function Has-MultilineCode {
    param([string]$Pattern)

    $files = Get-Files @(
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs"
    )

    foreach ($file in $files) {
        try {
            $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop

            if (
                [regex]::IsMatch(
                    $text,
                    $Pattern,
                    [System.Text.RegularExpressions.RegexOptions]::Singleline
                )
            ) {
                return $true
            }
        }
        catch {
        }
    }

    return $false
}
function Has-Code([string]$Pattern) {
    return (Search-Code $Pattern).Count -gt 0
}

function Has-File([string]$RelativePath) {
    return Test-Path (Join-Path $ProjectRoot $RelativePath)
}

# ============================================================
# INICIO
# ============================================================

Clear-Host

Write-Host ""
Write-Host "   CHATMI PROJECT SCANNER $ScriptVersion" -ForegroundColor Cyan
Write-Host "   Evaluacion profesional de 1 a 10" -ForegroundColor White
Write-Host ""
Write-Host "   Proyecto: $ProjectRoot" -ForegroundColor Gray
Write-Host "   Inicio:   $StartedAt" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    Write-Host ""
    Write-Host "[ERROR] No existe el proyecto: $ProjectRoot" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

# ============================================================
# 1. ESTRUCTURA DEL PROYECTO — 8 puntos
# ============================================================

Write-Title "1. ESTRUCTURA DEL PROYECTO"

if (Has-File "package.json") {
    Add-Result "Estructura" "package.json presente" PASS 1 1
} else {
    Add-Result "Estructura" "package.json presente" FAIL 0 1 "Proyecto Node incompleto."
}

if (Has-File "src") {
    Add-Result "Estructura" "Directorio src presente" PASS 1 1
} else {
    Add-Result "Estructura" "Directorio src presente" FAIL 0 1
}

if (Has-File "src\App.tsx") {
    Add-Result "Estructura" "App.tsx localizado" PASS 1 1
} else {
    Add-Result "Estructura" "App.tsx localizado" FAIL 0 1
}

if (Has-File "src\types.ts") {
    Add-Result "Estructura" "types.ts centralizado" PASS 1 1
} else {
    Add-Result "Estructura" "types.ts centralizado" WARN 0.3 1
}

if (Has-File "src\services\supabaseClient.ts") {
    Add-Result "Estructura" "Cliente Supabase separado" PASS 1 1
} else {
    Add-Result "Estructura" "Cliente Supabase separado" FAIL 0 1
}

if (Has-File "src\components") {
    Add-Result "Estructura" "Componentes separados" PASS 1 1
} else {
    Add-Result "Estructura" "Componentes separados" WARN 0.2 1
}

if (Has-File "src\services") {
    Add-Result "Estructura" "Servicios separados" PASS 1 1
} else {
    Add-Result "Estructura" "Servicios separados" WARN 0.2 1
}

if (Has-File ".gitignore") {
    Add-Result "Estructura" ".gitignore presente" PASS 1 1
} else {
    Add-Result "Estructura" ".gitignore presente" WARN 0.2 1
}

# ============================================================
# 2. TYPESCRIPT — 12 puntos
# ============================================================

Write-Title "2. TYPESCRIPT Y CALIDAD DE TIPOS"

if (Has-File "tsconfig.json") {
    Add-Result "TypeScript" "tsconfig.json presente" PASS 2 2
} else {
    Add-Result "TypeScript" "tsconfig.json presente" FAIL 0 2
}

$anyMatches = Search-Code "\bany\b"
$anyCount = $anyMatches.Count

if ($anyCount -le 10) {
    Add-Result "TypeScript" "Uso controlado de any" PASS 2 2 "$anyCount coincidencias."
}
elseif ($anyCount -le 30) {
    Add-Result "TypeScript" "Uso controlado de any" WARN 1 2 "$anyCount coincidencias."
}
else {
    Add-Result "TypeScript" "Uso controlado de any" FAIL 0 2 "$anyCount coincidencias. Conviene reducirlas."
}

$tsIgnore = Search-Code "@ts-ignore|@ts-nocheck"

if ($tsIgnore.Count -eq 0) {
    Add-Result "TypeScript" "Sin @ts-ignore / @ts-nocheck" PASS 2 2
} else {
    Add-Result "TypeScript" "Sin @ts-ignore / @ts-nocheck" WARN 0.5 2 "$($tsIgnore.Count) coincidencias."
}

$asAny = Search-Code "as any"

if ($asAny.Count -eq 0) {
    Add-Result "TypeScript" "Sin casts 'as any'" PASS 2 2
}
elseif ($asAny.Count -le 5) {
    Add-Result "TypeScript" "Pocos casts 'as any'" WARN 1 2 "$($asAny.Count) coincidencias."
}
else {
    Add-Result "TypeScript" "Exceso de casts 'as any'" FAIL 0 2 "$($asAny.Count) coincidencias."
}

if (Test-CommandExists "npx") {
    Write-Host ""
    Write-Host "Ejecutando TypeScript..." -ForegroundColor Gray

    $tsOutput = & npx tsc --noEmit 2>&1
    $tsExit = $LASTEXITCODE

    if ($tsExit -eq 0) {
        Add-Result "TypeScript" "npx tsc --noEmit" PASS 4 4 "Sin errores TypeScript."
    } else {
        Add-Result "TypeScript" "npx tsc --noEmit" FAIL 0 4 "TypeScript reporta errores."
        $tsOutput | Select-Object -First 20 | ForEach-Object {
            Write-Host "      $_" -ForegroundColor DarkYellow
        }
    }
} else {
    Add-Result "TypeScript" "npx disponible" FAIL 0 4
}

# ============================================================
# 3. SUPABASE Y AUTH — 15 puntos
# ============================================================

Write-Title "3. SUPABASE / AUTH / RECUPERACION DE CONTRASEÑA"

$supabaseClient = Join-Path $ProjectRoot "src\services\supabaseClient.ts"
$supabaseText = Read-FileSafe $supabaseClient

if ($supabaseText -match "VITE_SUPABASE_URL") {
    Add-Result "Supabase" "VITE_SUPABASE_URL configurado" PASS 1 1
} else {
    Add-Result "Supabase" "VITE_SUPABASE_URL configurado" FAIL 0 1
}

if ($supabaseText -match "VITE_SUPABASE_ANON_KEY") {
    Add-Result "Supabase" "VITE_SUPABASE_ANON_KEY configurado" PASS 1 1
} else {
    Add-Result "Supabase" "VITE_SUPABASE_ANON_KEY configurado" FAIL 0 1
}

if ($supabaseText -match "persistSession\s*:\s*true") {
    Add-Result "Supabase" "persistSession habilitado" PASS 1 1
} else {
    Add-Result "Supabase" "persistSession habilitado" WARN 0.2 1
}

if ($supabaseText -match "autoRefreshToken\s*:\s*true") {
    Add-Result "Supabase" "autoRefreshToken habilitado" PASS 1 1
} else {
    Add-Result "Supabase" "autoRefreshToken habilitado" WARN 0.2 1
}

if ($supabaseText -match "detectSessionInUrl\s*:\s*true") {
    Add-Result "Supabase" "detectSessionInUrl habilitado" PASS 2 2 "Importante para recovery/magic links."
} else {
    Add-Result "Supabase" "detectSessionInUrl habilitado" FAIL 0 2 "Puede romper recuperación de contraseña."
}

if (Has-Code "signInWithPassword") {
    Add-Result "Auth" "Login usa signInWithPassword" PASS 2 2
} else {
    Add-Result "Auth" "Login usa signInWithPassword" WARN 0.5 2
}

if (Has-Code "resetPasswordForEmail") {
    Add-Result "Auth" "Solicitud de recuperación encontrada" PASS 1 1
} else {
    Add-Result "Auth" "Solicitud de recuperación encontrada" FAIL 0 1
}

if (Has-MultilineCode "auth\.updateUser\s*\(\s*\{.*?password\s*:") {
    Add-Result "Auth" "Actualización de contraseña encontrada" PASS 2 2
} else {
    Add-Result "Auth" "Actualización de contraseña encontrada" FAIL 0 2
}

if (Has-Code "exchangeCodeForSession|PASSWORD_RECOVERY|type=recovery|recovery") {
    Add-Result "Auth" "Manejo de sesión recovery detectado" PASS 2 2
} else {
    Add-Result "Auth" "Manejo de sesión recovery detectado" FAIL 0 2 "Candidato principal al problema de restauración."
}

if (Has-Code "getSession\(") {
    Add-Result "Auth" "Validación/restauración de sesión detectada" PASS 1 1
} else {
    Add-Result "Auth" "Validación/restauración de sesión detectada" WARN 0.3 1
}

if (Has-Code "onAuthStateChange") {
    Add-Result "Auth" "Listener onAuthStateChange" PASS 1 1
} else {
    Add-Result "Auth" "Listener onAuthStateChange" WARN 0.3 1 "Útil para SIGNED_IN / PASSWORD_RECOVERY."
}

# ============================================================
# 4. PLAN FREE Y TOKENS — 15 puntos
# ============================================================

Write-Title "4. PLAN FREE / TOKENS / PERSISTENCIA"

if (Has-Code "FREE_TOKENS_MAX\s*=\s*3000") {
    Add-Result "Free Plan" "Límite FREE = 3,000 tokens" PASS 2 2
} else {
    Add-Result "Free Plan" "Límite FREE = 3,000 tokens" WARN 0.5 2
}

if (Has-Code "tokensRemaining") {
    Add-Result "Free Plan" "Contador tokensRemaining" PASS 1 1
} else {
    Add-Result "Free Plan" "Contador tokensRemaining" FAIL 0 1
}

if (Has-Code "totalTokens") {
    Add-Result "Free Plan" "TokenUsage totalTokens" PASS 1 1
} else {
    Add-Result "Free Plan" "TokenUsage totalTokens" FAIL 0 1
}

if (Has-Code "extractTokenUsage") {
    Add-Result "Free Plan" "Extracción real de usageMetadata" PASS 2 2
} else {
    Add-Result "Free Plan" "Extracción real de usageMetadata" WARN 0.5 2
}

if (Has-Code "estimateTokens") {
    Add-Result "Free Plan" "Fallback estimado de tokens" PASS 1 1
} else {
    Add-Result "Free Plan" "Fallback estimado de tokens" WARN 0 1
}

if (Has-Code "tokensRemaining\s*<=\s*0") {
    Add-Result "Free Plan" "Bloqueo cuando tokens llegan a 0" PASS 2 2
} else {
    Add-Result "Free Plan" "Bloqueo cuando tokens llegan a 0" FAIL 0 2 "FREE podría seguir consumiendo API."
}

if (Has-Code "free_quota_exhausted") {
    Add-Result "Free Plan" "Evento free_quota_exhausted" PASS 1 1
} else {
    Add-Result "Free Plan" "Evento free_quota_exhausted" WARN 0.3 1
}

if (Has-Code "account_quotas") {
    Add-Result "Free Plan" "Persistencia account_quotas en Supabase" PASS 2 2
} else {
    Add-Result "Free Plan" "Persistencia account_quotas en Supabase" FAIL 0 2 "Recargar/cambiar navegador podría reiniciar cuotas."
}

if (Has-Code "chatmig:quotas:") {
    Add-Result "Free Plan" "Cache local por email" PASS 1 1
} else {
    Add-Result "Free Plan" "Cache local por email" WARN 0 1
}

if (Has-Code "has_used_free") {
    Add-Result "Free Plan" "Protección para no repetir FREE" PASS 1 1
} else {
    Add-Result "Free Plan" "Protección para no repetir FREE" WARN 0.2 1
}

if (Has-Code "isLocked") {
    Add-Result "Free Plan" "ChatInput soporta bloqueo visual" PASS 1 1
} else {
    Add-Result "Free Plan" "ChatInput soporta bloqueo visual" WARN 0.2 1
}

# ============================================================
# 5. SEGURIDAD — 12 puntos
# ============================================================

Write-Title "5. SEGURIDAD"

$envFiles = @(
    ".env",
    ".env.local",
    ".env.production",
    ".env.development"
)

$gitignoreText = Read-FileSafe (Join-Path $ProjectRoot ".gitignore")

if ($gitignoreText -match "\.env") {
    Add-Result "Seguridad" ".env ignorado por Git" PASS 2 2
} else {
    Add-Result "Seguridad" ".env ignorado por Git" FAIL 0 2 "Agrega .env* a .gitignore."
}

$secretPatterns = @(
    "service_role",
    "SUPABASE_SERVICE_ROLE",
    "PAYPAL_CLIENT_SECRET",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY"
)

$exposed = @()

$sourceFiles = Get-Files @(".ts",".tsx",".js",".jsx")

foreach ($pattern in $secretPatterns) {
    foreach ($m in ($sourceFiles | Select-String -Pattern $pattern -ErrorAction SilentlyContinue)) {
        if ($m.Line -notmatch "import\.meta\.env|process\.env|VITE_|NEXT_PUBLIC_") {
            $exposed += $m
        }
    }
}

if ($exposed.Count -eq 0) {
    Add-Result "Seguridad" "Sin secretos evidentes hardcodeados" PASS 3 3
} else {
    Add-Result "Seguridad" "Sin secretos evidentes hardcodeados" FAIL 0 3 "$($exposed.Count) coincidencias sospechosas."
}

if (Has-Code "VITE_.*SECRET|VITE_.*SERVICE_ROLE") {
    Add-Result "Seguridad" "Secretos server-side no expuestos como VITE_*" FAIL 0 2 "Todo VITE_* termina en el navegador."
} else {
    Add-Result "Seguridad" "Secretos server-side no expuestos como VITE_*" PASS 2 2
}

if (Has-Code "console\.log.*password|console\.log.*token|console\.log.*access_token") {
    Add-Result "Seguridad" "No imprimir password/tokens sensibles" WARN 0.5 2 "Revisa logs sensibles."
} else {
    Add-Result "Seguridad" "No imprimir password/tokens sensibles" PASS 2 2
}

if (Has-Code "service_role") {
    Add-Result "Seguridad" "Uso de service_role revisado" WARN 0.5 1 "Confirma que nunca se exponga al frontend."
} else {
    Add-Result "Seguridad" "Sin service_role en frontend" PASS 1 1
}

if (Has-Code "row level security|enable row level security|create policy") {
    Add-Result "Seguridad" "RLS/policies detectadas en SQL" PASS 2 2
} else {
    Add-Result "Seguridad" "RLS/policies detectadas en SQL" WARN 0.5 2 "Verifica RLS manualmente en Supabase."
}

# ============================================================
# 6. PAYPAL — 8 puntos
# ============================================================

Write-Title "6. PAYPAL"

if (Has-Code "@paypal/react-paypal-js") {
    Add-Result "PayPal" "react-paypal-js integrado" PASS 1 1
} else {
    Add-Result "PayPal" "react-paypal-js integrado" WARN 0 1
}

if (Has-Code "PayPalScriptProvider") {
    Add-Result "PayPal" "PayPalScriptProvider detectado" PASS 1 1
} else {
    Add-Result "PayPal" "PayPalScriptProvider detectado" WARN 0.2 1
}

if (Has-Code "createOrder") {
    Add-Result "PayPal" "createOrder detectado" PASS 1 1
} else {
    Add-Result "PayPal" "createOrder detectado" WARN 0 1
}

if (Has-Code "onApprove") {
    Add-Result "PayPal" "onApprove detectado" PASS 1 1
} else {
    Add-Result "PayPal" "onApprove detectado" WARN 0 1
}

if (Has-Code "actions\.order\.capture") {
    Add-Result "PayPal" "Captura del pago detectada" PASS 1 1
} else {
    Add-Result "PayPal" "Captura del pago detectada" WARN 0 1
}

if (Has-Code "upgrade_success") {
    Add-Result "PayPal" "Upgrade registrado tras pago" PASS 1 1
} else {
    Add-Result "PayPal" "Upgrade registrado tras pago" WARN 0.2 1
}

if (Has-Code "intent.*capture|intent.*CAPTURE") {
    Add-Result "PayPal" "Intent CAPTURE configurado" PASS 1 1
} else {
    Add-Result "PayPal" "Intent CAPTURE configurado" WARN 0.3 1
}

# El warning unload del SDK NO se considera fallo.
Add-Result "PayPal" "Warning Permissions-Policy/unload" INFO 1 1 "No penaliza: normalmente proviene del SDK de PayPal."

# ============================================================
# 7. BUILD / DEPENDENCIAS — 15 puntos
# ============================================================

Write-Title "7. BUILD Y DEPENDENCIAS"

if (Test-CommandExists "node") {
    $nodeVersion = node --version
    Add-Result "Build" "Node disponible" PASS 1 1 "$nodeVersion"
} else {
    Add-Result "Build" "Node disponible" FAIL 0 1
}

if (Test-CommandExists "npm") {
    $npmVersion = npm --version
    Add-Result "Build" "npm disponible" PASS 1 1 "v$npmVersion"
} else {
    Add-Result "Build" "npm disponible" FAIL 0 1
}

if (Test-Path (Join-Path $ProjectRoot "node_modules")) {
    Add-Result "Build" "node_modules instalado" PASS 1 1
} else {
    Add-Result "Build" "node_modules instalado" WARN 0 1 "Ejecuta npm install."
}

# npm ls
if (Test-CommandExists "npm") {
    $lsOutput = npm ls --depth=0 2>&1
    if ($LASTEXITCODE -eq 0) {
        Add-Result "Build" "Árbol npm consistente" PASS 2 2
    } else {
        Add-Result "Build" "Árbol npm consistente" WARN 0.5 2
    }
}

# Build
if ($RunBuild -and (Test-CommandExists "npm")) {
    Write-Host ""
    Write-Host "Ejecutando npm run build..." -ForegroundColor Gray

    $buildOutput = npm run build 2>&1
    $buildExit = $LASTEXITCODE

    if ($buildExit -eq 0) {
        Add-Result "Build" "npm run build" PASS 6 6 "BUILD EXITOSO."
    } else {
        Add-Result "Build" "npm run build" FAIL 0 6 "El proyecto no compila."
        $buildOutput | Select-Object -Last 30 | ForEach-Object {
            Write-Host "      $_" -ForegroundColor DarkYellow
        }
    }
} else {
    Add-Result "Build" "npm run build" INFO 0 6 "No ejecutado."
}

# Audit
if ($RunAudit -and (Test-CommandExists "npm")) {
    Write-Host ""
    Write-Host "Ejecutando npm audit..." -ForegroundColor Gray

    $auditJsonRaw = npm audit --omit=dev --json 2>$null

    try {
        $audit = $auditJsonRaw | ConvertFrom-Json
        $v = $audit.metadata.vulnerabilities

        $critical = [int]$v.critical
        $high = [int]$v.high
        $moderate = [int]$v.moderate
        $low = [int]$v.low

        if ($critical -eq 0 -and $high -eq 0) {
            Add-Result "Build" "npm audit producción" PASS 4 4 "Critical=$critical High=$high Moderate=$moderate Low=$low"
        }
        elseif ($critical -eq 0 -and $high -le 2) {
            Add-Result "Build" "npm audit producción" WARN 2 4 "Critical=$critical High=$high Moderate=$moderate Low=$low"
        }
        else {
            Add-Result "Build" "npm audit producción" FAIL 0 4 "Critical=$critical High=$high Moderate=$moderate Low=$low"
        }
    }
    catch {
        Add-Result "Build" "npm audit producción" WARN 1 4 "No se pudo interpretar el JSON."
    }
} else {
    Add-Result "Build" "npm audit producción" INFO 0 4 "No ejecutado."
}

# ============================================================
# 8. CALIDAD DEL CODIGO — 10 puntos
# ============================================================

Write-Title "8. CALIDAD DE CODIGO"

$todo = Search-Code "TODO|FIXME|HACK"
if ($todo.Count -le 5) {
    Add-Result "Calidad" "TODO/FIXME controlados" PASS 1 1 "$($todo.Count) encontrados."
} else {
    Add-Result "Calidad" "TODO/FIXME controlados" WARN 0.4 1 "$($todo.Count) encontrados."
}

$consoleCount = (Search-Code "console\.(log|warn|error)").Count

if ($consoleCount -le 20) {
    Add-Result "Calidad" "Logging controlado" PASS 1 1 "$consoleCount logs."
}
elseif ($consoleCount -le 60) {
    Add-Result "Calidad" "Logging controlado" WARN 0.5 1 "$consoleCount logs."
}
else {
    Add-Result "Calidad" "Logging controlado" WARN 0.2 1 "$consoleCount logs. Conviene centralizar."
}

$duplicateActivity = Search-Code "export type ActivityType"

if ($duplicateActivity.Count -le 1) {
    Add-Result "Calidad" "ActivityType con origen único" PASS 2 2
} else {
    Add-Result "Calidad" "ActivityType con origen único" WARN 0.5 2 "$($duplicateActivity.Count) definiciones."
}

$createClients = Search-Code "createClient\("

if ($createClients.Count -eq 1) {
    Add-Result "Calidad" "Un solo cliente Supabase" PASS 2 2
}
elseif ($createClients.Count -gt 1) {
    Add-Result "Calidad" "Un solo cliente Supabase" WARN 0.5 2 "$($createClients.Count) createClient encontrados."
}
else {
    Add-Result "Calidad" "Un solo cliente Supabase" FAIL 0 2
}

if (Has-Code "useCallback") {
    Add-Result "Calidad" "Optimización React con useCallback" PASS 1 1
} else {
    Add-Result "Calidad" "Optimización React con useCallback" INFO 0.5 1
}

if (Has-Code "useMemo") {
    Add-Result "Calidad" "Optimización React con useMemo" PASS 1 1
} else {
    Add-Result "Calidad" "Optimización React con useMemo" INFO 0.5 1
}

if (Has-Code "React\.memo|memo\(") {
    Add-Result "Calidad" "Componentes memoizados" PASS 1 1
} else {
    Add-Result "Calidad" "Componentes memoizados" INFO 0.5 1
}

if (Has-Code "catch\s*\(") {
    Add-Result "Calidad" "Manejo explícito de errores" PASS 1 1
} else {
    Add-Result "Calidad" "Manejo explícito de errores" WARN 0 1
}

# ============================================================
# 9. TESTS — 5 puntos
# ============================================================

Write-Title "9. TESTS"

$testFiles = @(
    Get-ChildItem -Path $ProjectRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch "\\node_modules\\" -and
        (
            $_.Name -match "\.(test|spec)\.(ts|tsx|js|jsx)$" -or
            $_.DirectoryName -match "\\(__tests__|tests|test)($|\\)"
        )
    }
)

if ($testFiles.Count -ge 10) {
    Add-Result "Tests" "Suite de tests" PASS 5 5 "$($testFiles.Count) archivos."
}
elseif ($testFiles.Count -ge 3) {
    Add-Result "Tests" "Suite de tests" WARN 3 5 "$($testFiles.Count) archivos."
}
elseif ($testFiles.Count -ge 1) {
    Add-Result "Tests" "Suite de tests" WARN 1 5 "$($testFiles.Count) archivo(s)."
}
else {
    Add-Result "Tests" "Suite de tests" FAIL 0 5 "No se detectaron tests automatizados."
}

# ============================================================
# RESUMEN
# ============================================================

Write-Title "RESULTADO FINAL"

$totalPoints = ($Results | Measure-Object Points -Sum).Sum
$totalMax = ($Results | Measure-Object MaxPoints -Sum).Sum

if (!$totalPoints) { $totalPoints = 0 }
if (!$totalMax) { $totalMax = 1 }

$percentage = [math]::Round(($totalPoints / $totalMax) * 100, 1)
$score10 = [math]::Round(($percentage / 10), 1)

if ($score10 -gt 10) { $score10 = 10 }
if ($score10 -lt 0) { $score10 = 0 }

$grade = switch ($score10) {
    { $_ -ge 9.5 } { "EXCELENTE / PRODUCCION PREMIUM"; break }
    { $_ -ge 9.0 } { "MUY ALTO NIVEL"; break }
    { $_ -ge 8.0 } { "MUY BUENO"; break }
    { $_ -ge 7.0 } { "BUENO, PERO REQUIERE HARDENING"; break }
    { $_ -ge 6.0 } { "FUNCIONAL CON DEUDA TECNICA"; break }
    { $_ -ge 5.0 } { "RIESGO MEDIO"; break }
    default { "NO LISTO PARA PRODUCCION" }
}

$scoreColor = if ($score10 -ge 9) {
    "Green"
} elseif ($score10 -ge 7) {
    "Yellow"
} else {
    "Red"
}

Write-Host ""
Write-Host "   PUNTUACION CHATMI" -ForegroundColor White
Write-Host ""
Write-Host "        $score10 / 10" -ForegroundColor $scoreColor
Write-Host "        $percentage %" -ForegroundColor $scoreColor
Write-Host ""
Write-Host "   ESTADO: $grade" -ForegroundColor $scoreColor
Write-Host ""

$pass = ($Results | Where-Object Status -eq "PASS").Count
$warn = ($Results | Where-Object Status -eq "WARN").Count
$fail = ($Results | Where-Object Status -eq "FAIL").Count

Write-Host "   OK:       $pass" -ForegroundColor Green
Write-Host "   WARNING:  $warn" -ForegroundColor Yellow
Write-Host "   FAIL:     $fail" -ForegroundColor Red

# ============================================================
# TOP PROBLEMAS
# ============================================================

Write-Title "PRIORIDADES PARA LLEGAR A 10/10"

$problems = @(
    $Results |
    Where-Object { $_.Status -in @("FAIL","WARN") } |
    Sort-Object @{
        Expression = { $_.MaxPoints - $_.Points }
        Descending = $true
    }
)

if ($problems.Count -eq 0) {
    Write-Host "[OK] No se detectaron problemas importantes." -ForegroundColor Green
}
else {
    $i = 1

    foreach ($p in ($problems | Select-Object -First 15)) {
        Write-Host ""
        Write-Host "$i. [$($p.Status)] $($p.Check)" -ForegroundColor $(if ($p.Status -eq "FAIL") { "Red" } else { "Yellow" })

        if ($p.Detail) {
            Write-Host "   $($p.Detail)" -ForegroundColor Gray
        }

        $i++
    }
}

# ============================================================
# REPORTE TXT
# ============================================================

$ReportsDir = Join-Path $ProjectRoot "reports"

if (!(Test-Path $ReportsDir)) {
    New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $ReportsDir "chatmi-evaluacion-$stamp.txt"

$report = New-Object System.Collections.Generic.List[string]

$report.Add("CHATMI PROJECT SCANNER $ScriptVersion")
$report.Add("Fecha: $(Get-Date)")
$report.Add("Proyecto: $ProjectRoot")
$report.Add("")
$report.Add("PUNTUACION: $score10 / 10")
$report.Add("PORCENTAJE: $percentage %")
$report.Add("ESTADO: $grade")
$report.Add("")
$report.Add("========================================")
$report.Add("RESULTADOS")
$report.Add("========================================")

foreach ($r in $Results) {
    $report.Add(
        "[$($r.Status)] [$($r.Category)] $($r.Check) | $($r.Points)/$($r.MaxPoints) | $($r.Detail)"
    )
}

$report.Add("")
$report.Add("========================================")
$report.Add("PRIORIDADES")
$report.Add("========================================")

$i = 1
foreach ($p in ($problems | Select-Object -First 20)) {
    $report.Add("$i. [$($p.Status)] $($p.Check) - $($p.Detail)")
    $i++
}

$report | Set-Content -LiteralPath $reportPath -Encoding UTF8

$elapsed = (Get-Date) - $StartedAt

Write-Host ""
Write-Host ("=" * 90) -ForegroundColor DarkGray
Write-Host ""
Write-Host "[OK] Reporte guardado:" -ForegroundColor Green
Write-Host "     $reportPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Duracion: $([math]::Round($elapsed.TotalSeconds, 1)) segundos" -ForegroundColor Gray
Write-Host ""

# Código salida:
# 0 = >= 8
# 1 = 6-7.9
# 2 = < 6

if ($score10 -ge 8) {
    exit 0
}

if ($score10 -ge 6) {
    exit 1
}

exit 2

