# ============================
# DIAGNOSTICO CHATMIG
# ============================
$root = "C:\Users\martin\Desktop\APPS\ChatMi"
Set-Location $root

Write-Host "== Raiz del proyecto: $root =="

# Directorios a ignorar
$excludeDirs = @('node_modules', 'dist', '.git')

function NotInExcludedDirs {
    param([string]$filePath)
    foreach ($ex in $excludeDirs) {
        if ($filePath -like "*\$ex\*") { return $false }
    }
    return $true
}

# ========================================
# 1) BUSCAR USOS DE index.css
# ========================================
Write-Host "==========================="
Write-Host "1) Buscando referencias a index.css"
Write-Host "==========================="

Get-ChildItem -Path $root -Recurse -File |
    Where-Object { NotInExcludedDirs $_.FullName } |
    Select-String -Pattern "index.css" -SimpleMatch -ErrorAction SilentlyContinue |
    ForEach-Object {
        "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()
    }

Write-Host ""
Write-Host "-> Si solo aparece en index.html como <link href=""/index.css""> y no tienes ese archivo,"
Write-Host "   probablemente puedes borrar esa linea."
Write-Host ""

# ========================================
# 2) REVISAR ARCHIVOS .env Y SUPABASE
# ========================================
Write-Host "==========================="
Write-Host "2) Revisando .env / Supabase (URL y keys)"
Write-Host "==========================="

$envFiles = Get-ChildItem -Path $root -Filter ".env*" -File -ErrorAction SilentlyContinue

if (-not $envFiles) {
    Write-Host "No se encontraron archivos .env* en el proyecto."
} else {
    foreach ($file in $envFiles) {
        Write-Host ""
        Write-Host "---- Archivo ENV: $($file.Name) ----"

        Get-Content $file.FullName |
            Where-Object { $_ -match 'SUPABASE|FRONTEND_API_BASE|VITE_SITE_URL|APP_URL|API_PORT' } |
            ForEach-Object {
                $line = $_.Trim()
                if ($line -match '^(?<key>[A-Z0-9_]+)=(?<val>.+)$') {
                    $key = $matches['key']
                    $val = $matches['val']

                    $cleanVal = $val.Trim('"').Trim("'")
                    if ($cleanVal.Length -gt 12) {
                        $preview = $cleanVal.Substring(0,4) + "..." + $cleanVal.Substring($cleanVal.Length-4,4)
                    } else {
                        $preview = $cleanVal
                    }

                    Write-Host "$key = $preview"
                } else {
                    Write-Host $line
                }
            }
    }
}

Write-Host ""
Write-Host "-> Revisa que:"
Write-Host "   - SUPABASE_URL / VITE_SUPABASE_URL apunte a tu URL de Supabase."
Write-Host "   - En el FRONTEND NO uses service_role, solo la anon key."
Write-Host ""

# ========================================
# 3) BUSCAR service_role / ROLE KEY EN EL CODIGO
# ========================================
Write-Host "==========================="
Write-Host "3) Buscando service_role / role key en el codigo"
Write-Host "==========================="

Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs |
    Where-Object { NotInExcludedDirs $_.FullName } |
    Select-String -Pattern "service_role|SUPABASE_SERVICE_ROLE|role key" -SimpleMatch -ErrorAction SilentlyContinue |
    ForEach-Object {
        "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()
    }

Write-Host ""
Write-Host "-> Si ves service_role en codigo del FRONTEND, eso esta mal: esa key es solo para backend."
Write-Host ""

# ========================================
# 4) REVISAR createClient DE SUPABASE
# ========================================
Write-Host "==========================="
Write-Host "4) Buscando createClient de Supabase"
Write-Host "==========================="

Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs |
    Where-Object { NotInExcludedDirs $_.FullName } |
    Select-String -Pattern "createClient\s*\(" -ErrorAction SilentlyContinue |
    ForEach-Object {
        "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()
    }

Write-Host ""
Write-Host 'FIN DEL DIAGNOSTICO'
