#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const ROOT = process.cwd();

const TARGET_DIR = path.join(ROOT, "dist", "assets");
const NAME_RE = /^index/i;                 // index*
const EXT_RE = /\.(js|mjs|cjs|css|map)$/i; // lo normal en dist
const SUSPICIOUS_GOOGLE_KEY_RE = /\bAIza[0-9A-Za-z\-_]{10,100}\b/g; // más agresivo
const STRICT_GOOGLE_KEY_RE = /\bAIza[0-9A-Za-z\-_]{35}\b/g;         // típico

function preview(line, max = 200) {
  const s = line.replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function main() {
  let entries;
  try {
    entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  } catch {
    console.error(`No existe: ${TARGET_DIR}`);
    process.exit(1);
  }

  const files = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => NAME_RE.test(n) && EXT_RE.test(n))
    .map(n => path.join(TARGET_DIR, n));

  console.log(`Modo: ${WRITE ? "WRITE" : "DRY-RUN"}`);
  console.log(`Targets: ${files.length} archivo(s)\n`);

  let scanned = 0, changed = 0, strictFound = 0, suspiciousFound = 0;

  for (const f of files) {
    scanned++;
    const data = await fs.readFile(f, "utf8");

    const strict = data.match(STRICT_GOOGLE_KEY_RE) || [];
    const suspicious = data.match(SUSPICIOUS_GOOGLE_KEY_RE) || [];

    strictFound += strict.length;
    suspiciousFound += suspicious.length;

    if (suspicious.length === 0) continue;

    console.log(`FOUND: ${path.relative(ROOT, f)} (strict=${strict.length}, suspicious=${suspicious.length})`);

    // Si no quieres tocar “sospechosas” (por falsos positivos), cambia a STRICT_GOOGLE_KEY_RE aquí:
    const out = data.replace(SUSPICIOUS_GOOGLE_KEY_RE, "REDACTED_GOOGLE_API_KEY");

    if (out !== data) {
      changed++;
      if (WRITE) {
        await fs.writeFile(f, out, "utf8");
        console.log(`  REDACTED`);
      } else {
        console.log(`  WOULD REDACT`);
      }
    }
  }

  console.log(`\nResumen: scanned=${scanned} changed=${changed} strict_keys=${strictFound} suspicious_hits=${suspiciousFound}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
