param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Version = "4.0.0"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$BackupRoot = Join-Path $ProjectRoot ".hardening-backups\fase4-$Stamp"
$ReportsDir = Join-Path $ProjectRoot "reports"
$ScannerV2 = Join-Path $ProjectRoot "scripts\evaluar-chatmi-v2.ps1"

function Section {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 94) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 94) -ForegroundColor DarkGray
}

function OK {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function WARN {
    param([string]$Text)
    Write-Host "[!]  $Text" -ForegroundColor Yellow
}

function FAIL {
    param([string]$Text)
    Write-Host "[X]  $Text" -ForegroundColor Red
}

function CHANGE {
    param([string]$Text)
    Write-Host "[+]  $Text" -ForegroundColor Magenta
}

function Backup-PackageState {
    param([string]$Destination)

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null

    Copy-Item `
        (Join-Path $ProjectRoot "package.json") `
        (Join-Path $Destination "package.json") `
        -Force

    $lock = Join-Path $ProjectRoot "package-lock.json"

    if (Test-Path $lock) {
        Copy-Item `
            $lock `
            (Join-Path $Destination "package-lock.json") `
            -Force
    }
}

function Restore-PackageState {
    param([string]$Source)

    Copy-Item `
        (Join-Path $Source "package.json") `
        (Join-Path $ProjectRoot "package.json") `
        -Force

    $lockBackup = Join-Path $Source "package-lock.json"

    if (Test-Path $lockBackup) {
        Copy-Item `
            $lockBackup `
            (Join-Path $ProjectRoot "package-lock.json") `
            -Force
    }

    Push-Location $ProjectRoot

    try {
        Write-Host "Restaurando node_modules..." -ForegroundColor DarkGray

        npm install | Out-Host

        if ($LASTEXITCODE -ne 0) {
            throw "npm install falló durante rollback."
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-TypeScript {

    Push-Location $ProjectRoot

    try {
        npx tsc --noEmit | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Invoke-Tests {

    Push-Location $ProjectRoot

    try {
        npm test | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Invoke-Build {

    Push-Location $ProjectRoot

    try {
        npm run build | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
    }
}

function Test-Project {

    Write-Host ""
    Write-Host "--- TypeScript ---" -ForegroundColor Gray

    if (!(Invoke-TypeScript)) {
        FAIL "TypeScript falló."
        return $false
    }

    Write-Host ""
    Write-Host "--- Tests ---" -ForegroundColor Gray

    if (!(Invoke-Tests)) {
        FAIL "Tests fallaron."
        return $false
    }

    Write-Host ""
    Write-Host "--- Build ---" -ForegroundColor Gray

    if (!(Invoke-Build)) {
        FAIL "Build falló."
        return $false
    }

    return $true
}

function Get-PackageSection {
    param([string]$PackageName)

    $packageFile = Join-Path $ProjectRoot "package.json"

    $package = Get-Content `
        -LiteralPath $packageFile `
        -Raw |
        ConvertFrom-Json

    if ($null -ne $package.dependencies) {

        $names = @(
            $package.dependencies.PSObject.Properties.Name
        )

        if ($names -contains $PackageName) {
            return "dependencies"
        }
    }

    if ($null -ne $package.devDependencies) {

        $names = @(
            $package.devDependencies.PSObject.Properties.Name
        )

        if ($names -contains $PackageName) {
            return "devDependencies"
        }
    }

    return $null
}

function Trial-Upgrade {
    param(
        [string]$PackageName,
        [string]$Version
    )

    $section = Get-PackageSection $PackageName

    if (!$section) {
        WARN "$PackageName no es dependencia directa. No se fuerza."
        return
    }

    $safeName = (
        $PackageName `
            -replace "@", "" `
            -replace "/", "-"
    )

    $trialBackup = Join-Path `
        $BackupRoot `
        "trial-$safeName"

    Backup-PackageState $trialBackup

    Section "PROBANDO $PackageName@$Version"

    Push-Location $ProjectRoot

    try {

        if ($section -eq "devDependencies") {

            npm install `
                --save-dev `
                "$PackageName@$Version" |
                Out-Host
        }
        else {

            npm install `
                "$PackageName@$Version" |
                Out-Host
        }

        if ($LASTEXITCODE -ne 0) {

            WARN "npm install falló. Revirtiendo $PackageName."

            Restore-PackageState $trialBackup

            return
        }
    }
    finally {
        Pop-Location
    }

    if (Test-Project) {

        OK "$PackageName@$Version CONSERVADO."
    }
    else {

        WARN "$PackageName@$Version rompe validación. Rollback."

        Restore-PackageState $trialBackup

        if (!(Test-Project)) {
            throw "Rollback de $PackageName no recuperó el proyecto."
        }

        OK "Rollback $PackageName confirmado."
    }
}

function Trial-AuditFix {

    Section "PROBANDO NPM AUDIT FIX"

    $auditBackup = Join-Path `
        $BackupRoot `
        "trial-audit-fix"

    Backup-PackageState $auditBackup

    Push-Location $ProjectRoot

    try {

        npm audit fix | Out-Host

        # npm audit puede devolver 1 aunque haya aplicado
        # correcciones. No usamos su exit code para decidir.
    }
    finally {
        Pop-Location
    }

    if (Test-Project) {

        OK "npm audit fix CONSERVADO."
    }
    else {

        WARN "npm audit fix rompió compatibilidad."

        Restore-PackageState $auditBackup

        if (!(Test-Project)) {
            throw "El rollback de npm audit fix falló."
        }

        OK "npm audit fix revertido."
    }
}

# ============================================================
# INICIO
# ============================================================

Clear-Host

Write-Host ""
Write-Host " CHATMI HARDENING FASE 4 — $Version" -ForegroundColor Cyan
Write-Host " Seguridad + scanner real + rollback por dependencia" -ForegroundColor White
Write-Host ""

if (!(Test-Path $ProjectRoot)) {
    throw "No existe: $ProjectRoot"
}

Set-Location $ProjectRoot

New-Item `
    -ItemType Directory `
    -Path $BackupRoot `
    -Force |
    Out-Null

New-Item `
    -ItemType Directory `
    -Path $ReportsDir `
    -Force |
    Out-Null

# ============================================================
# 1. BASELINE
# ============================================================

Section "1. BASELINE"

if (!(Test-Project)) {
    throw "El proyecto no está limpio antes de Fase 4."
}

OK "Baseline completamente funcional."

# ============================================================
# 2. BACKUP MAESTRO
# ============================================================

Section "2. BACKUP MAESTRO"

Copy-Item `
    (Join-Path $ProjectRoot "src") `
    (Join-Path $BackupRoot "src") `
    -Recurse `
    -Force

if (Test-Path (Join-Path $ProjectRoot "tests")) {

    Copy-Item `
        (Join-Path $ProjectRoot "tests") `
        (Join-Path $BackupRoot "tests") `
        -Recurse `
        -Force
}

Backup-PackageState `
    (Join-Path $BackupRoot "packages-original")

OK "Backup Fase 4 creado."
Write-Host $BackupRoot -ForegroundColor DarkGray

# ============================================================
# 3. REACT ROUTER
# ============================================================

Trial-Upgrade `
    -PackageName "react-router-dom" `
    -Version "7.18.2"

# ============================================================
# 4. VERCEL NODE
# Solo se toca si es dependencia DIRECTA.
# ============================================================

Trial-Upgrade `
    -PackageName "@vercel/node" `
    -Version "latest"

# ============================================================
# 5. AUDIT FIX DESPUES DE LOS UPGRADES
# ============================================================

Trial-AuditFix

# ============================================================
# 6. BROWSERSLIST
# ============================================================

Section "6. BROWSERSLIST"

Push-Location $ProjectRoot

try {

    npx update-browserslist-db@latest | Out-Host

    if ($LASTEXITCODE -eq 0) {
        OK "Browserslist actualizado."
    }
    else {
        WARN "Browserslist no pudo actualizarse."
    }
}
finally {
    Pop-Location
}

if (!(Test-Project)) {

    WARN "Browserslist alteró el proyecto. Restaurando packages originales."

    Restore-PackageState `
        (Join-Path $BackupRoot "packages-original")

    if (!(Test-Project)) {
        throw "Rollback general falló."
    }
}

# ============================================================
# 7. CREAR SCANNER V2 REAL
# ============================================================

Section "7. CREANDO SCANNER V2"

$scannerSource = @'
param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Continue"

$Results = New-Object System.Collections.Generic.List[object]

function Title {
    param([string]$Text)

    Write-Host ""
    Write-Host ("=" * 90) -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host ("=" * 90) -ForegroundColor DarkGray
}

function Result {
    param(
        [string]$Category,
        [string]$Name,
        [string]$Status,
        [double]$Points,
        [double]$Max,
        [string]$Detail = ""
    )

    $Results.Add(
        [PSCustomObject]@{
            Category = $Category
            Name     = $Name
            Status   = $Status
            Points   = $Points
            Max      = $Max
            Detail   = $Detail
        }
    ) | Out-Null

    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        default { "Cyan" }
    }

    $prefix = switch ($Status) {
        "PASS" { "[OK]" }
        "WARN" { "[!]" }
        "FAIL" { "[X]" }
        default { "[i]" }
    }

    Write-Host "$prefix $Name" -ForegroundColor $color

    if ($Detail) {
        Write-Host "     $Detail" -ForegroundColor DarkGray
    }
}

function Get-SrcFiles {

    $src = Join-Path $ProjectRoot "src"

    if (!(Test-Path $src)) {
        return @()
    }

    return @(
        Get-ChildItem `
            -Path $src `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in `
                ".ts",
                ".tsx",
                ".js",
                ".jsx",
                ".mjs",
                ".cjs"
        }
    )
}

function Search-Src {
    param([string]$Pattern)

    $files = Get-SrcFiles

    if ($files.Count -eq 0) {
        return @()
    }

    return @(
        $files |
        Select-String `
            -Pattern $Pattern `
            -ErrorAction SilentlyContinue
    )
}

function Has-SrcRaw {
    param([string]$Pattern)

    foreach ($file in (Get-SrcFiles)) {

        try {

            $text = Get-Content `
                -LiteralPath $file.FullName `
                -Raw `
                -ErrorAction Stop

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

function Has-File {
    param([string]$Relative)

    return Test-Path (
        Join-Path $ProjectRoot $Relative
    )
}

Clear-Host

Write-Host ""
Write-Host " CHATMI SCANNER V2 — MEDICION REAL" -ForegroundColor Cyan
Write-Host " Solo analiza código activo; no backups/reports." -ForegroundColor White

Set-Location $ProjectRoot

# ============================================================
# 1. ESTRUCTURA — 8
# ============================================================

Title "1. ESTRUCTURA"

$structureChecks = @(
    @{ Path="package.json"; Name="package.json" },
    @{ Path="src\App.tsx"; Name="App.tsx" },
    @{ Path="src\types.ts"; Name="types.ts" },
    @{ Path="src\services\supabaseClient.ts"; Name="supabaseClient.ts" },
    @{ Path="src\components"; Name="components/" },
    @{ Path="src\services"; Name="services/" },
    @{ Path="src\AuthWrapper.tsx"; Name="AuthWrapper.tsx" },
    @{ Path="src\main.tsx"; Name="main.tsx" }
)

foreach ($check in $structureChecks) {

    if (Has-File $check.Path) {
        Result "Structure" $check.Name PASS 1 1
    }
    else {
        Result "Structure" $check.Name FAIL 0 1
    }
}

# ============================================================
# 2. TYPESCRIPT — 12
# ============================================================

Title "2. TYPESCRIPT"

$anyCount = (
    Search-Src '(:\s*any\b|\bas\s+any\b|<any>)'
).Count

if ($anyCount -le 10) {
    Result "Types" "Uso de any" PASS 4 4 "$anyCount coincidencias reales."
}
elseif ($anyCount -le 30) {
    Result "Types" "Uso de any" WARN 3 4 "$anyCount coincidencias reales."
}
elseif ($anyCount -le 60) {
    Result "Types" "Uso de any" WARN 1.5 4 "$anyCount coincidencias reales."
}
else {
    Result "Types" "Uso de any" FAIL 0 4 "$anyCount coincidencias reales."
}

$ignoreCount = (
    Search-Src '@ts-ignore|@ts-nocheck'
).Count

if ($ignoreCount -eq 0) {
    Result "Types" "Sin supresión TypeScript" PASS 2 2
}
else {
    Result "Types" "Sin supresión TypeScript" FAIL 0 2 "$ignoreCount supresiones."
}

$tsOutput = & npx tsc --noEmit 2>&1

if ($LASTEXITCODE -eq 0) {
    Result "Types" "tsc --noEmit" PASS 6 6 "0 errores."
}
else {
    Result "Types" "tsc --noEmit" FAIL 0 6
}

# ============================================================
# 3. AUTH — 14
# ============================================================

Title "3. AUTH / SUPABASE"

$authChecks = @(
    @{
        Name="signInWithPassword"
        Pattern='signInWithPassword'
        Points=2
    },
    @{
        Name="resetPasswordForEmail"
        Pattern='resetPasswordForEmail'
        Points=2
    },
    @{
        Name="PASSWORD_RECOVERY"
        Pattern='PASSWORD_RECOVERY'
        Points=2
    },
    @{
        Name="updateUser(password)"
        Pattern='auth\.updateUser\s*\(\s*\{.*?password\s*:'
        Points=3
    },
    @{
        Name="onAuthStateChange"
        Pattern='onAuthStateChange'
        Points=1
    },
    @{
        Name="persistSession"
        Pattern='persistSession\s*:\s*true'
        Points=1
    },
    @{
        Name="autoRefreshToken"
        Pattern='autoRefreshToken\s*:\s*true'
        Points=1
    },
    @{
        Name="detectSessionInUrl"
        Pattern='detectSessionInUrl\s*:\s*true'
        Points=1
    },
    @{
        Name="/reset-password"
        Pattern='/reset-password'
        Points=1
    }
)

foreach ($check in $authChecks) {

    if (Has-SrcRaw $check.Pattern) {
        Result "Auth" $check.Name PASS $check.Points $check.Points
    }
    else {
        Result "Auth" $check.Name FAIL 0 $check.Points
    }
}

# ============================================================
# 4. FREE — 14
# ============================================================

Title "4. FREE PLAN"

$freeChecks = @(
    @{
        Name="FREE = 3000 tokens"
        Pattern='FREE_TOKENS_MAX\s*=\s*3000'
        Points=3
    },
    @{
        Name="tokensRemaining"
        Pattern='tokensRemaining'
        Points=1
    },
    @{
        Name="Bloqueo <= 0"
        Pattern='tokensRemaining\s*<=\s*0'
        Points=2
    },
    @{
        Name="account_quotas"
        Pattern='account_quotas'
        Points=2
    },
    @{
        Name="Cache por usuario"
        Pattern='chatmig:quotas:'
        Points=1
    },
    @{
        Name="free_quota_exhausted"
        Pattern='free_quota_exhausted'
        Points=1
    },
    @{
        Name="totalTokens"
        Pattern='totalTokens'
        Points=1
    },
    @{
        Name="usageMetadata"
        Pattern='usageMetadata'
        Points=1
    },
    @{
        Name="has_used_free"
        Pattern='has_used_free'
        Points=1
    },
    @{
        Name="Chat bloqueable"
        Pattern='isLocked'
        Points=1
    }
)

foreach ($check in $freeChecks) {

    if (Has-SrcRaw $check.Pattern) {
        Result "Free" $check.Name PASS $check.Points $check.Points
    }
    else {
        Result "Free" $check.Name FAIL 0 $check.Points
    }
}

# ============================================================
# 5. SEGURIDAD — 14
# ============================================================

Title "5. SEGURIDAD"

$gitignore = ""

if (Has-File ".gitignore") {
    $gitignore = Get-Content `
        (Join-Path $ProjectRoot ".gitignore") `
        -Raw
}

if ($gitignore -match '\.env') {
    Result "Security" ".env ignorado" PASS 2 2
}
else {
    Result "Security" ".env ignorado" FAIL 0 2
}

$literalSecrets = (
    Search-Src `
        '(AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE\s*=\s*["''][^"'']+)'
).Count

if ($literalSecrets -eq 0) {
    Result "Security" "Sin secretos literales" PASS 4 4
}
else {
    Result "Security" "Sin secretos literales" FAIL 0 4 "$literalSecrets coincidencias."
}

$viteSecrets = (
    Search-Src `
        'VITE_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE_KEY)'
).Count

if ($viteSecrets -eq 0) {
    Result "Security" "Sin secretos VITE_*" PASS 3 3
}
else {
    Result "Security" "Sin secretos VITE_*" FAIL 0 3 "$viteSecrets coincidencias."
}

$clientCount = (
    Search-Src 'createClient\s*\('
).Count

if ($clientCount -eq 1) {
    Result "Security" "Cliente Supabase único" PASS 2 2
}
else {
    Result "Security" "Cliente Supabase único" WARN 1 2 "$clientCount ocurrencias."
}

$sensitiveLogs = (
    Search-Src `
        'console\.(log|info|warn|error).*?(password|access_token|refresh_token|api[_-]?key)'
).Count

if ($sensitiveLogs -eq 0) {
    Result "Security" "Sin logs sensibles evidentes" PASS 3 3
}
else {
    Result "Security" "Sin logs sensibles evidentes" WARN 1 3 "$sensitiveLogs coincidencias."
}

# ============================================================
# 6. PAYPAL — 8
# ============================================================

Title "6. PAYPAL"

$paypalChecks = @(
    @{ Name="PayPalScriptProvider"; Pattern='PayPalScriptProvider'; Points=1 },
    @{ Name="createOrder"; Pattern='createOrder'; Points=2 },
    @{ Name="onApprove"; Pattern='onApprove'; Points=2 },
    @{ Name="CAPTURE"; Pattern='capture|CAPTURE'; Points=1 },
    @{ Name="Upgrade"; Pattern='upgrade_success'; Points=1 },
    @{ Name="react-paypal-js"; Pattern='@paypal/react-paypal-js'; Points=1 }
)

foreach ($check in $paypalChecks) {

    if (Has-SrcRaw $check.Pattern) {
        Result "PayPal" $check.Name PASS $check.Points $check.Points
    }
    else {
        Result "PayPal" $check.Name WARN 0 $check.Points
    }
}

# ============================================================
# 7. BUILD + SECURITY DEPS — 14
# ============================================================

Title "7. BUILD / DEPENDENCIAS"

$buildOutput = & npm run build 2>&1

if ($LASTEXITCODE -eq 0) {
    Result "Build" "Build producción" PASS 5 5
}
else {
    Result "Build" "Build producción" FAIL 0 5
}

$auditRaw = (
    & npm audit --omit=dev --json 2>$null |
    Out-String
)

try {

    $audit = $auditRaw | ConvertFrom-Json
    $v = $audit.metadata.vulnerabilities

    if ([int]$v.critical -eq 0) {
        Result "Build" "0 críticas producción" PASS 3 3
    }
    else {
        Result "Build" "0 críticas producción" FAIL 0 3 "$($v.critical)"
    }

    if ([int]$v.high -eq 0) {
        Result "Build" "0 altas producción" PASS 4 4
    }
    elseif ([int]$v.high -le 2) {
        Result "Build" "Altas producción" WARN 2 4 "$($v.high)"
    }
    else {
        Result "Build" "Altas producción" FAIL 0 4 "$($v.high)"
    }

    if (
        [int]$v.moderate -eq 0 -and
        [int]$v.low -eq 0
    ) {
        Result "Build" "0 moderate/low producción" PASS 2 2
    }
    else {
        Result `
            "Build" `
            "Moderate/low producción" `
            WARN `
            1 `
            2 `
            "Moderate=$($v.moderate) Low=$($v.low)"
    }
}
catch {

    Result "Build" "npm audit producción" WARN 0 9 "No se pudo interpretar."
}

# ============================================================
# 8. CALIDAD — 8
# ============================================================

Title "8. CALIDAD"

$logs = (
    Search-Src 'console\.(log|info|warn|error)'
).Count

if ($logs -le 50) {
    Result "Quality" "Logging" PASS 2 2 "$logs"
}
elseif ($logs -le 150) {
    Result "Quality" "Logging" WARN 1 2 "$logs"
}
else {
    Result "Quality" "Logging" WARN 0.5 2 "$logs"
}

$todos = (
    Search-Src 'TODO|FIXME|HACK'
).Count

if ($todos -le 5) {
    Result "Quality" "TODO/FIXME" PASS 2 2 "$todos"
}
elseif ($todos -le 15) {
    Result "Quality" "TODO/FIXME" WARN 1 2 "$todos"
}
else {
    Result "Quality" "TODO/FIXME" WARN 0.5 2 "$todos"
}

$activityDefs = (
    Search-Src `
        '(export\s+type\s+ActivityType|type\s+ActivityType\s*=)'
).Count

if ($activityDefs -le 1) {
    Result "Quality" "ActivityType único" PASS 2 2
}
else {
    Result "Quality" "ActivityType único" WARN 1 2 "$activityDefs"
}

if (
    Has-SrcRaw 'useCallback' -and
    Has-SrcRaw 'useMemo'
) {
    Result "Quality" "Optimización React" PASS 2 2
}
else {
    Result "Quality" "Optimización React" WARN 1 2
}

# ============================================================
# 9. TESTS — 8
# ============================================================

Title "9. TESTS"

$testFiles = @()

$testsDir = Join-Path $ProjectRoot "tests"

if (Test-Path $testsDir) {

    $testFiles = @(
        Get-ChildItem `
            $testsDir `
            -Recurse `
            -File |
        Where-Object {
            $_.Name -match '\.(test|spec)\.(ts|tsx|js|jsx)$'
        }
    )
}

if ($testFiles.Count -ge 10) {
    Result "Tests" "Cobertura mínima de tests" PASS 3 3 "$($testFiles.Count) archivos."
}
elseif ($testFiles.Count -ge 5) {
    Result "Tests" "Cobertura mínima de tests" WARN 2 3 "$($testFiles.Count)"
}
else {
    Result "Tests" "Cobertura mínima de tests" FAIL 0 3 "$($testFiles.Count)"
}

$testOutput = & npm test 2>&1

if ($LASTEXITCODE -eq 0) {
    Result "Tests" "npm test" PASS 5 5
}
else {
    Result "Tests" "npm test" FAIL 0 5
}

# ============================================================
# SCORE
# ============================================================

Title "RESULTADO REAL"

$points = (
    $Results |
    Measure-Object Points -Sum
).Sum

$max = (
    $Results |
    Measure-Object Max -Sum
).Sum

$percentage = [math]::Round(
    ($points / $max) * 100,
    1
)

$score = [math]::Round(
    $percentage / 10,
    1
)

if ($score -gt 10) {
    $score = 10
}

Write-Host ""
Write-Host " CHATMI" -ForegroundColor White
Write-Host ""
Write-Host "     $score / 10" -ForegroundColor $(
    if ($score -ge 9) {
        "Green"
    }
    elseif ($score -ge 8) {
        "Yellow"
    }
    else {
        "Red"
    }
)

Write-Host ""
Write-Host " $percentage %" -ForegroundColor Cyan

$failures = @(
    $Results |
    Where-Object Status -eq "FAIL"
)

$warnings = @(
    $Results |
    Where-Object Status -eq "WARN"
)

Write-Host ""
Write-Host " FAIL : $($failures.Count)" -ForegroundColor Red
Write-Host " WARN : $($warnings.Count)" -ForegroundColor Yellow

if ($failures.Count -gt 0) {

    Title "BLOQUEOS PARA 10/10"

    foreach ($item in $failures) {

        Write-Host (
            "[X] {0} — {1}" -f
            $item.Name,
            $item.Detail
        ) -ForegroundColor Red
    }
}

if ($warnings.Count -gt 0) {

    Title "MEJORAS RESTANTES"

    foreach ($item in $warnings) {

        Write-Host (
            "[!] {0} — {1}" -f
            $item.Name,
            $item.Detail
        ) -ForegroundColor Yellow
    }
}
'@

Set-Content `
    -LiteralPath $ScannerV2 `
    -Value $scannerSource `
    -Encoding UTF8

# Validación sintáctica del nuevo scanner
$tokens = $null
$parseErrors = $null

[System.Management.Automation.Language.Parser]::ParseFile(
    $ScannerV2,
    [ref]$tokens,
    [ref]$parseErrors
) | Out-Null

if ($parseErrors.Count -gt 0) {

    FAIL "Scanner V2 contiene errores sintácticos."

    $parseErrors | ForEach-Object {
        Write-Host (
            "Linea {0}: {1}" -f
            $_.Extent.StartLineNumber,
            $_.Message
        ) -ForegroundColor Red
    }

    throw "Scanner V2 inválido."
}

OK "Scanner V2 creado y validado."

# ============================================================
# 8. VALIDACION FINAL
# ============================================================

Section "8. VALIDACION FINAL FASE 4"

if (!(Test-Project)) {
    throw "Fase 4 terminó con proyecto inválido."
}

OK "TypeScript + tests + build = OK."

# ============================================================
# 9. AUDIT PRODUCCION
# ============================================================

Section "9. AUDIT PRODUCCION"

npm audit --omit=dev | Out-Host

# ============================================================
# 10. PUNTUACION REAL
# ============================================================

Section "10. PUNTUACION CHATMI REAL"

powershell `
    -ExecutionPolicy Bypass `
    -File $ScannerV2 `
    -ProjectRoot $ProjectRoot

Write-Host ""
Write-Host ("=" * 94) -ForegroundColor DarkGray
Write-Host ""
Write-Host " FASE 4 TERMINADA" -ForegroundColor Green
Write-Host ""
Write-Host " Scanner nuevo:" -ForegroundColor White
Write-Host " $ScannerV2" -ForegroundColor Cyan
Write-Host ""
Write-Host " Backup:" -ForegroundColor White
Write-Host " $BackupRoot" -ForegroundColor Cyan
Write-Host ""