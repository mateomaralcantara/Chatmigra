#!/usr/bin/env python3
import os
import sys
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "src"

# Extensiones que consideramos para módulos locales
CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]
STYLE_EXTS = [".css", ".scss", ".sass", ".less"]
ALL_EXTS = CODE_EXTS + STYLE_EXTS

IGNORED_DIRS = {"node_modules", "dist", "build", ".git", ".turbo", ".next"}

issues = []  # cada item será un dict con {kind, message, file?}


def add_issue(kind: str, message: str, file: Path | None = None):
    issues.append(
        {
            "kind": kind,
            "message": message,
            "file": str(file) if file else None,
        }
    )


def print_header():
    print("=" * 70)
    print("🔎 Project Health Check (JS/TS + Vite/React friendly)")
    print(f"📂 Root: {ROOT}")
    print("=" * 70)


def run_cmd(label: str, cmd: list[str]):
    print(f"\n▶ Ejecutando: {label} -> {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        add_issue(
            "tooling",
            f"No se encontró el comando '{cmd[0]}'. ¿Está instalado?",
        )
        print(f"  ⚠ {cmd[0]} no está disponible")
        return

    if result.returncode != 0:
        msg = (
            f"Comando '{' '.join(cmd)}' falló con código {result.returncode}.\n"
            f"STDERR (recortado):\n{result.stderr[:2000]}"
        )
        add_issue("command_failed", msg)
        print("  ❌ Falló (revisar detalles en el resumen final)")
    else:
        print("  ✅ OK")


def load_package_json():
    pkg_path = ROOT / "package.json"
    if not pkg_path.exists():
        add_issue("config", "No se encontró package.json en la raíz del proyecto.")
        print("\n⚠ No hay package.json, se saltan checks de npm.")
        return None

    try:
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        add_issue("config", f"Error leyendo package.json: {e}")
        print("\n❌ Error leyendo package.json")
        return None


def check_npm_scripts():
    print("\n=== Check: scripts de npm (lint / typecheck / build / test) ===")
    pkg = load_package_json()
    if not pkg:
        return

    scripts = pkg.get("scripts", {})
    desired = ["lint", "typecheck", "build", "test"]

    for s in desired:
        if s in scripts:
            run_cmd(f"npm run {s}", ["npm", "run", s])
        else:
            print(f"  ℹ No hay script '{s}' en package.json (se omite)")


def find_source_files():
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.suffix in CODE_EXTS:
            yield path


IMPORT_PATTERNS = [
    re.compile(r'import\s+[^;]*?\s+from\s+[\'"](.+?)[\'"]'),  # import x from '...'
    re.compile(r'import\s+[\'"](.+?)[\'"]'),                 # import '...'
    re.compile(r'require\(\s*[\'"](.+?)[\'"]\s*\)'),         # require('...')
]


def resolve_relative_import(file_path: Path, import_path: str) -> bool:
    """
    Devuelve True si la ruta de import se puede resolver a un archivo existente.
    Solo se procesan rutas relativas (./ o ../).
    """
    if not import_path.startswith("."):
        # no es relativo -> asumimos que es paquete de node, dejamos que Vite/Node lo maneje
        return True

    # ignorar query params o anchors tipo './foo?raw' o './foo#hash'
    clean = import_path.split("?")[0].split("#")[0]

    base_dir = file_path.parent
    target = (base_dir / clean).resolve()

    # 1) Si existe tal cual, perfecto
    if target.is_file():
        return True

    # 2) Si ya tiene extensión, probamos solo eso
    if target.suffix:
        if target.is_file():
            return True
        return False

    # 3) Sin extensión: probamos con todas las extensiones conocidas
    for ext in ALL_EXTS:
        candidate = target.with_suffix(ext)
        if candidate.is_file():
            return True

    # 4) Probamos como carpeta con index.ext
    if target.is_dir():
        for ext in ALL_EXTS:
            candidate = target / ("index" + ext)
            if candidate.is_file():
                return True

    return False


def check_imports():
    print("\n=== Check: imports relativos rotos ===")
    broken = []

    for file_path in find_source_files():
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            add_issue("read_error", f"No se pudo leer {file_path}: {e}", file_path)
            continue

        imports = []
        for pattern in IMPORT_PATTERNS:
            imports.extend(pattern.findall(text))

        for imp in imports:
            if not imp.startswith("."):
                continue  # solo nos interesan los relativos
            if not resolve_relative_import(file_path, imp):
                broken.append((file_path, imp))

    if not broken:
        print("  ✅ No se encontraron imports relativos rotos.")
        return

    print(f"  ❌ Encontrados {len(broken)} imports potencialmente rotos:")
    for f, imp in broken[:50]:  # no spamear infinito
        msg = f"Import relativo roto '{imp}' en {f}"
        add_issue("broken_import", msg, f)
        print(f"     - {f}: {imp}")

    if len(broken) > 50:
        print(f"     ... y {len(broken) - 50} más")


ENV_VAR_PATTERNS = [
    re.compile(r"import\.meta\.env\.([A-Z0-9_]+)"),
    re.compile(r"process\.env\.([A-Z0-9_]+)"),
]


def collect_used_env_vars():
    used = set()
    for file_path in find_source_files():
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for pattern in ENV_VAR_PATTERNS:
            matches = pattern.findall(text)
            used.update(matches)
    return used


def collect_defined_env_vars():
    defined = set()
    for env_file in ROOT.glob(".env*"):
        if not env_file.is_file():
            continue
        try:
            for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key = line.split("=", 1)[0].strip()
                if key:
                    defined.add(key)
        except Exception:
            continue
    return defined


def check_env_vars():
    print("\n=== Check: variables de entorno usadas vs definidas (.env*) ===")
    used = collect_used_env_vars()
    defined = collect_defined_env_vars()

    if not used:
        print("  ℹ No se detectaron env vars usadas en el código (import.meta.env / process.env).")
        return

    print(f"  ℹ Usadas en código: {len(used)}")
    print(f"  ℹ Definidas en .env*: {len(defined)}")

    missing = sorted(used - defined)
    if not missing:
        print("  ✅ Todas las env vars usadas están definidas en algún .env*.")
        return

    print(f"  ❌ Env vars usadas pero NO definidas en .env* ({len(missing)}):")
    for key in missing:
        msg = f"Variable de entorno usada pero no definida en .env*: {key}"
        add_issue("missing_env_var", msg)
        print(f"     - {key}")


def check_tsconfig():
    print("\n=== Check: tsconfig.json básico ===")
    tsconfig = ROOT / "tsconfig.json"
    if not tsconfig.exists():
        print("  ⚠ No existe tsconfig.json (si usas TS, deberías tener uno).")
        add_issue("config", "No existe tsconfig.json en la raíz del proyecto.")
        return

    try:
        data = json.loads(tsconfig.read_text(encoding="utf-8"))
    except Exception as e:
        print("  ❌ Error leyendo tsconfig.json")
        add_issue("config", f"Error leyendo tsconfig.json: {e}")
        return

    compiler = data.get("compilerOptions", {})
    strict = compiler.get("strict")
    if strict is not True:
        print("  ⚠ compilerOptions.strict no está activado. No es un error, pero en prod es MUY recomendable.")
        add_issue(
            "tsconfig_warning",
            "compilerOptions.strict no está en true en tsconfig.json (recomendado para producción).",
            tsconfig,
        )
    else:
        print("  ✅ tsconfig.json tiene strict=true.")


def summary_and_exit():
    print("\n" + "=" * 70)
    if not issues:
        print("✅ RESUMEN: No se encontraron problemas críticos.")
        print("   Obviamente esto no garantiza perfección, pero vas bastante decente. 😎")
        print("=" * 70)
        sys.exit(0)

    print(f"⚠ RESUMEN: Se encontraron {len(issues)} posibles problemas:\n")
    for i, issue in enumerate(issues, start=1):
        loc = f" ({issue['file']})" if issue.get("file") else ""
        print(f"{i}. [{issue['kind']}] {issue['message']}{loc}\n")

    print("=" * 70)
    print("❌ Exit code 1 para que puedas usar este script en CI/CD si quieres.")
    print("=" * 70)
    sys.exit(1)


def main():
    print_header()
    check_npm_scripts()
    check_imports()
    check_env_vars()
    check_tsconfig()
    summary_and_exit()


if __name__ == "__main__":
    main()
