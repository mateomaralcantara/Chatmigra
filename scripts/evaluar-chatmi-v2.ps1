param(
    [string]$ProjectRoot = "C:\Users\martin\Desktop\VSC\APPS\ChatMi"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$Results = New-Object System.Collections.Generic.List[object]

function Write-Section {
    param([string]$Title)

    Write-Host ""
    Write-Host ("=" * 88) -ForegroundColor DarkGray
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host ("=" * 88) -ForegroundColor DarkGray
}

function Add-Check {
    param(
        [string]$Category,
        [string]$Name,
        [ValidateSet("PASS","WARN","FAIL","INFO")]
        [string]$Status,
        [double]$Points,
        [double]$MaxPoints,
        [string]$Detail = ""
    )

    $Results.Add(
        [PSCustomObject]@{
            Category  = $Category
            Name      = $Name
            Status    = $Status
            Points    = $Points
            MaxPoints = $MaxPoints
            Detail    = $Detail
        }
    ) | Out-Null

    $prefix = switch ($Status) {
        "PASS" { "[OK]" }
        "WARN" { "[!]" }
        "FAIL" { "[X]" }
        default { "[i]" }
    }

    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        default { "Cyan" }
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
            -LiteralPath $src `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in @(
                ".ts",
                ".tsx",
                ".js",
                ".jsx",
                ".mjs",
                ".cjs"
            )
        }
    )
}

function Search-Src {
    param([string]$Pattern)

    $files = @(Get-SrcFiles)

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

function Has-Src {
    param([string]$Pattern)

    foreach ($file in @(Get-SrcFiles)) {

        try {

            $text = Get-Content `
                -LiteralPath $file.FullName `
                -Raw `
                -ErrorAction Stop

            $options =
                [System.Text.RegularExpressions.RegexOptions]::Singleline

            if ([regex]::IsMatch($text, $Pattern, $options)) {
                return $true
            }
        }
        catch {
        }
    }

    return $false
}

function Has-ProjectFile {
    param([string]$RelativePath)

    return Test-Path (
        Join-Path $ProjectRoot $RelativePath
    )
}

Clear-Host

Write-Host ""
Write-Host " CHATMI PROJECT SCANNER V2.1" -ForegroundColor Cyan
Write-Host " Evaluacion activa real - sin backups historicos" -ForegroundColor White
Write-Host ""
Write-Host " Proyecto: $ProjectRoot" -ForegroundColor Gray

if (!(Test-Path $ProjectRoot)) {
    throw "No existe ProjectRoot."
}

Set-Location $ProjectRoot

# ============================================================
# 1. ESTRUCTURA — 8
# ============================================================

Write-Section "1. ESTRUCTURA"

$structure = @(
    "package.json",
    "src\App.tsx",
    "src\main.tsx",
    "src\AuthWrapper.tsx",
    "src\types.ts",
    "src\components",
    "src\services",
    "src\services\supabaseClient.ts"
)

foreach ($item in $structure) {

    if (Has-ProjectFile $item) {
        Add-Check "Structure" $item PASS 1 1
    }
    else {
        Add-Check "Structure" $item FAIL 0 1
    }
}

# ============================================================
# 2. TYPESCRIPT — 14
# ============================================================

Write-Section "2. TYPESCRIPT"

$tsOutput = & npx tsc --noEmit 2>&1
$tsCode = $LASTEXITCODE

if ($tsCode -eq 0) {
    Add-Check "Types" "TypeScript 0 errores" PASS 8 8
}
else {
    Add-Check "Types" "TypeScript 0 errores" FAIL 0 8

    $tsOutput |
        Select-Object -Last 25 |
        ForEach-Object {
            Write-Host "     $_" -ForegroundColor DarkYellow
        }
}

$anyCount = @(
    Search-Src '(:\s*any\b|\bas\s+any\b|<any>)'
).Count

if ($anyCount -le 10) {
    Add-Check "Types" "Uso de any" PASS 4 4 "$anyCount"
}
elseif ($anyCount -le 30) {
    Add-Check "Types" "Uso de any" WARN 3 4 "$anyCount"
}
elseif ($anyCount -le 60) {
    Add-Check "Types" "Uso de any" WARN 1.5 4 "$anyCount"
}
else {
    Add-Check "Types" "Uso de any" FAIL 0 4 "$anyCount"
}

$tsSuppressions = @(
    Search-Src '@ts-ignore|@ts-nocheck'
).Count

if ($tsSuppressions -eq 0) {
    Add-Check "Types" "Sin supresiones TypeScript" PASS 2 2
}
else {
    Add-Check "Types" "Sin supresiones TypeScript" FAIL 0 2 "$tsSuppressions"
}

# ============================================================
# 3. AUTH / SUPABASE — 14
# ============================================================

Write-Section "3. AUTH / SUPABASE"

$authChecks = @(
    @{
        Name = "signInWithPassword"
        Pattern = 'signInWithPassword'
        Points = 1
    },
    @{
        Name = "resetPasswordForEmail"
        Pattern = 'resetPasswordForEmail'
        Points = 2
    },
    @{
        Name = "PASSWORD_RECOVERY"
        Pattern = 'PASSWORD_RECOVERY'
        Points = 2
    },
    @{
        Name = "updateUser(password)"
        Pattern = 'auth\.updateUser\s*\(\s*\{.*?password\s*:'
        Points = 3
    },
    @{
        Name = "onAuthStateChange"
        Pattern = 'onAuthStateChange'
        Points = 1
    },
    @{
        Name = "persistSession"
        Pattern = 'persistSession\s*:\s*true'
        Points = 1
    },
    @{
        Name = "autoRefreshToken"
        Pattern = 'autoRefreshToken\s*:\s*true'
        Points = 1
    },
    @{
        Name = "detectSessionInUrl"
        Pattern = 'detectSessionInUrl\s*:\s*true'
        Points = 1
    },
    @{
        Name = "Ruta reset-password"
        Pattern = '/reset-password'
        Points = 2
    }
)

foreach ($check in $authChecks) {

    if (Has-Src $check.Pattern) {
        Add-Check `
            "Auth" `
            $check.Name `
            PASS `
            $check.Points `
            $check.Points
    }
    else {
        Add-Check `
            "Auth" `
            $check.Name `
            FAIL `
            0 `
            $check.Points
    }
}

# ============================================================
# 4. PLAN FREE — 14
# ============================================================

Write-Section "4. PLAN FREE"

$freeChecks = @(
    @{
        Name = "FREE 3000 tokens"
        Pattern = 'FREE_TOKENS_MAX\s*=\s*3000'
        Points = 3
    },
    @{
        Name = "tokensRemaining"
        Pattern = 'tokensRemaining'
        Points = 1
    },
    @{
        Name = "Bloqueo cuota agotada"
        Pattern = 'tokensRemaining\s*<=\s*0'
        Points = 2
    },
    @{
        Name = "account_quotas Supabase"
        Pattern = 'account_quotas'
        Points = 2
    },
    @{
        Name = "Cache local"
        Pattern = 'chatmig:quotas:'
        Points = 1
    },
    @{
        Name = "free_quota_exhausted"
        Pattern = 'free_quota_exhausted'
        Points = 1
    },
    @{
        Name = "totalTokens"
        Pattern = 'totalTokens'
        Points = 1
    },
    @{
        Name = "usageMetadata"
        Pattern = 'usageMetadata'
        Points = 1
    },
    @{
        Name = "has_used_free"
        Pattern = 'has_used_free'
        Points = 1
    },
    @{
        Name = "Bloqueo UI"
        Pattern = 'isLocked'
        Points = 1
    }
)

foreach ($check in $freeChecks) {

    if (Has-Src $check.Pattern) {
        Add-Check `
            "Free" `
            $check.Name `
            PASS `
            $check.Points `
            $check.Points
    }
    else {
        Add-Check `
            "Free" `
            $check.Name `
            FAIL `
            0 `
            $check.Points
    }
}

# ============================================================
# 5. SEGURIDAD — 14
# ============================================================

Write-Section "5. SEGURIDAD"

$gitIgnorePath = Join-Path $ProjectRoot ".gitignore"

if (Test-Path $gitIgnorePath) {

    $gitIgnore = Get-Content `
        -LiteralPath $gitIgnorePath `
        -Raw

    if ($gitIgnore -match '\.env') {
        Add-Check "Security" ".env ignorado por Git" PASS 2 2
    }
    else {
        Add-Check "Security" ".env ignorado por Git" FAIL 0 2
    }
}
else {
    Add-Check "Security" ".gitignore presente" FAIL 0 2
}

$literalSecrets = @(
    Search-Src `
        '(AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,})'
).Count

if ($literalSecrets -eq 0) {
    Add-Check "Security" "Sin secretos literales" PASS 4 4
}
else {
    Add-Check "Security" "Sin secretos literales" FAIL 0 4 "$literalSecrets"
}

$viteSecrets = @(
    Search-Src `
        'VITE_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE_KEY)'
).Count

if ($viteSecrets -eq 0) {
    Add-Check "Security" "Sin secretos privados VITE_*" PASS 3 3
}
else {
    Add-Check "Security" "Sin secretos privados VITE_*" FAIL 0 3 "$viteSecrets"
}

$createClientCount = @(
    Search-Src 'createClient\s*\('
).Count

if ($createClientCount -eq 1) {
    Add-Check "Security" "Un cliente Supabase" PASS 2 2
}
else {
    Add-Check `
        "Security" `
        "Un cliente Supabase" `
        WARN `
        1 `
        2 `
        "$createClientCount encontrados"
}

$sensitiveLogs = @(
    Search-Src `
        'console\.(log|info|warn|error).*?(password|access_token|refresh_token|api[_-]?key)'
).Count

if ($sensitiveLogs -eq 0) {
    Add-Check "Security" "Sin logs sensibles evidentes" PASS 3 3
}
else {
    Add-Check `
        "Security" `
        "Sin logs sensibles evidentes" `
        WARN `
        1 `
        3 `
        "$sensitiveLogs encontrados"
}

# ============================================================
# 6. PAYPAL — 8
# ============================================================

Write-Section "6. PAYPAL"

$paypalChecks = @(
    @{
        Name = "PayPalScriptProvider"
        Pattern = 'PayPalScriptProvider'
        Points = 1
    },
    @{
        Name = "createOrder"
        Pattern = 'createOrder'
        Points = 2
    },
    @{
        Name = "onApprove"
        Pattern = 'onApprove'
        Points = 2
    },
    @{
        Name = "Capture"
        Pattern = 'capture|CAPTURE'
        Points = 1
    },
    @{
        Name = "upgrade_success"
        Pattern = 'upgrade_success'
        Points = 1
    },
    @{
        Name = "react-paypal-js"
        Pattern = '@paypal/react-paypal-js'
        Points = 1
    }
)

foreach ($check in $paypalChecks) {

    if (Has-Src $check.Pattern) {
        Add-Check `
            "PayPal" `
            $check.Name `
            PASS `
            $check.Points `
            $check.Points
    }
    else {
        Add-Check `
            "PayPal" `
            $check.Name `
            WARN `
            0 `
            $check.Points
    }
}

# ============================================================
# 7. BUILD + DEPENDENCIAS — 14
# ============================================================

Write-Section "7. BUILD / DEPENDENCIAS"

$buildOutput = & npm run build 2>&1
$buildCode = $LASTEXITCODE

if ($buildCode -eq 0) {
    Add-Check "Build" "Build producción" PASS 5 5
}
else {
    Add-Check "Build" "Build producción" FAIL 0 5
}

$auditRaw = (
    & npm audit --omit=dev --json 2>$null |
    Out-String
)

try {

    $audit = $auditRaw | ConvertFrom-Json
    $v = $audit.metadata.vulnerabilities

    $critical = [int]$v.critical
    $high = [int]$v.high
    $moderate = [int]$v.moderate
    $low = [int]$v.low

    if ($critical -eq 0) {
        Add-Check "Build" "0 críticas producción" PASS 3 3
    }
    else {
        Add-Check "Build" "0 críticas producción" FAIL 0 3 "$critical"
    }

    if ($high -eq 0) {
        Add-Check "Build" "0 altas producción" PASS 4 4
    }
    elseif ($high -le 2) {
        Add-Check "Build" "Altas producción" WARN 2 4 "$high"
    }
    else {
        Add-Check "Build" "Altas producción" FAIL 0 4 "$high"
    }

    if (($moderate -eq 0) -and ($low -eq 0)) {
        Add-Check "Build" "0 moderate/low producción" PASS 2 2
    }
    else {
        Add-Check `
            "Build" `
            "Moderate/low producción" `
            WARN `
            1 `
            2 `
            "Moderate=$moderate Low=$low"
    }
}
catch {

    Add-Check `
        "Build" `
        "npm audit producción legible" `
        WARN `
        0 `
        9
}

# ============================================================
# 8. TESTS — 8
# ============================================================

Write-Section "8. TESTS"

$testsPath = Join-Path $ProjectRoot "tests"

$testFiles = @()

if (Test-Path $testsPath) {

    $testFiles = @(
        Get-ChildItem `
            -LiteralPath $testsPath `
            -Recurse `
            -File `
            -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match '\.(test|spec)\.(ts|tsx|js|jsx)$'
        }
    )
}

if ($testFiles.Count -ge 10) {
    Add-Check `
        "Tests" `
        "Suite de pruebas" `
        PASS `
        3 `
        3 `
        "$($testFiles.Count) archivos"
}
elseif ($testFiles.Count -ge 5) {
    Add-Check `
        "Tests" `
        "Suite de pruebas" `
        WARN `
        2 `
        3 `
        "$($testFiles.Count) archivos"
}
else {
    Add-Check `
        "Tests" `
        "Suite de pruebas" `
        FAIL `
        0 `
        3 `
        "$($testFiles.Count) archivos"
}

$testOutput = & npm test 2>&1
$testCode = $LASTEXITCODE

if ($testCode -eq 0) {
    Add-Check "Tests" "npm test" PASS 5 5
}
else {
    Add-Check "Tests" "npm test" FAIL 0 5
}

# ============================================================
# 9. CALIDAD — 6
# ============================================================

Write-Section "9. CALIDAD"

$logs = @(
    Search-Src 'console\.(log|info|warn|error)'
).Count

if ($logs -le 50) {
    Add-Check "Quality" "Logging" PASS 2 2 "$logs"
}
elseif ($logs -le 150) {
    Add-Check "Quality" "Logging" WARN 1 2 "$logs"
}
else {
    Add-Check "Quality" "Logging" WARN 0.5 2 "$logs"
}

$todos = @(
    Search-Src 'TODO|FIXME|HACK'
).Count

if ($todos -le 5) {
    Add-Check "Quality" "TODO/FIXME" PASS 2 2 "$todos"
}
elseif ($todos -le 15) {
    Add-Check "Quality" "TODO/FIXME" WARN 1 2 "$todos"
}
else {
    Add-Check "Quality" "TODO/FIXME" WARN 0.5 2 "$todos"
}

$activityDefinitions = @(
    Search-Src `
        '(export\s+type\s+ActivityType|type\s+ActivityType\s*=)'
).Count

if ($activityDefinitions -le 1) {
    Add-Check "Quality" "ActivityType único" PASS 2 2
}
else {
    Add-Check `
        "Quality" `
        "ActivityType único" `
        WARN `
        1 `
        2 `
        "$activityDefinitions"
}

# ============================================================
# SCORE
# ============================================================

Write-Section "RESULTADO FINAL"

$totalPoints = (
    $Results |
    Measure-Object Points -Sum
).Sum

$totalMax = (
    $Results |
    Measure-Object MaxPoints -Sum
).Sum

if (!$totalPoints) {
    $totalPoints = 0
}

if (!$totalMax) {
    $totalMax = 1
}

$percent = [math]::Round(
    ($totalPoints / $totalMax) * 100,
    1
)

$score = [math]::Round(
    $percent / 10,
    1
)

if ($score -gt 10) {
    $score = 10
}

$color = if ($score -ge 9) {
    "Green"
}
elseif ($score -ge 8) {
    "Yellow"
}
else {
    "Red"
}

Write-Host ""
Write-Host "        CHATMI" -ForegroundColor White
Write-Host ""
Write-Host "        $score / 10" -ForegroundColor $color
Write-Host "        $percent %" -ForegroundColor $color

$passes = @(
    $Results |
    Where-Object Status -eq "PASS"
).Count

$warnings = @(
    $Results |
    Where-Object Status -eq "WARN"
).Count

$failures = @(
    $Results |
    Where-Object Status -eq "FAIL"
).Count

Write-Host ""
Write-Host " PASS : $passes" -ForegroundColor Green
Write-Host " WARN : $warnings" -ForegroundColor Yellow
Write-Host " FAIL : $failures" -ForegroundColor Red

if ($failures -gt 0) {

    Write-Section "BLOQUEOS PARA 10/10"

    $Results |
        Where-Object Status -eq "FAIL" |
        ForEach-Object {

            Write-Host (
                "[X] {0}: {1}" -f
                $_.Name,
                $_.Detail
            ) -ForegroundColor Red
        }
}

if ($warnings -gt 0) {

    Write-Section "MEJORAS RESTANTES"

    $Results |
        Where-Object Status -eq "WARN" |
        ForEach-Object {

            Write-Host (
                "[!] {0}: {1}" -f
                $_.Name,
                $_.Detail
            ) -ForegroundColor Yellow
        }
}
