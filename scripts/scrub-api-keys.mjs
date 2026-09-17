#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const get = (f, def) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const ROOT = path.resolve(get("--root", process.cwd()));
const WRITE = has("--write"); // si no, es dry-run
const VERBOSE = has("--verbose");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

// No tocar .env, .env.local, .env.production, etc.
const ENV_FILE_RE = /^\.env(\.|$)/i;

// Solo archivos típicamente de texto (puedes ampliar si quieres)
const TEXT_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx",
  ".mjs", ".cjs",
  ".json", ".map",
  ".html", ".css", ".scss",
  ".md", ".txt", ".yml", ".yaml",
  ".toml", ".xml",
]);

// Google API Key (Gemini normalmente usa esto): "AIza" + 35 chars => 39 total
const GOOGLE_API_KEY_RE = /AIza[0-9A-Za-z\-_]{35}/g;

let scanned = 0;
let changed = 0;
let matches = 0;
const changedFiles = [];
const skippedFiles = [];

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // si no tiene extensión, igual podría ser texto (por ejemplo ".npmrc"), lo dejamos fuera por seguridad
  return TEXT_EXTS.has(ext);
}

function shouldSkipFile(filePath) {
  const base = path.basename(filePath);
  if (ENV_FILE_RE.test(base)) return true;
  return false;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);

    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      await walk(full);
      continue;
    }

    if (!ent.isFile()) continue;

    // No tocar envs
    if (shouldSkipFile(full)) continue;

    // Filtrar por extensiones texto (para no romper binarios)
    if (!isTextFile(full)) continue;

    await processFile(full);
  }
}

async function processFile(filePath) {
  scanned++;

  let data;
  try {
    data = await fs.readFile(filePath, "utf8");
  } catch (e) {
    skippedFiles.push({ filePath, reason: `read failed: ${e.message}` });
    return;
  }

  // Contar y reemplazar
  const found = data.match(GOOGLE_API_KEY_RE);
  if (!found) return;

  matches += found.length;

  const redacted = data.replace(GOOGLE_API_KEY_RE, "REDACTED_GOOGLE_API_KEY");
  if (redacted === data) return;

  changed++;
  changedFiles.push({ filePath, count: found.length });

  if (WRITE) {
    try {
      await fs.writeFile(filePath, redacted, "utf8");
    } catch (e) {
      skippedFiles.push({ filePath, reason: `write failed: ${e.message}` });
      return;
    }
  }

  if (VERBOSE) {
    console.log(`${WRITE ? "REDACTED" : "WOULD REDACT"}: ${filePath} (${found.length})`);
  }
}

(async () => {
  console.log(`Root: ${ROOT}`);
  console.log(`Mode: ${WRITE ? "WRITE (modifica archivos)" : "DRY-RUN (no modifica nada)"}`);
  console.log(`Excluding: .env* and dirs: ${Array.from(EXCLUDE_DIRS).join(", ")}`);
  console.log("");

  await walk(ROOT);

  console.log("---- Summary ----");
  console.log(`Scanned files: ${scanned}`);
  console.log(`Files with keys: ${changed}`);
  console.log(`Total keys found: ${matches}`);

  if (changedFiles.length) {
    console.log("");
    console.log("Files affected:");
    for (const f of changedFiles) {
      console.log(`- ${f.filePath} (${f.count})`);
    }
  }

  if (skippedFiles.length) {
    console.log("");
    console.log("Skipped (read/write issues):");
    for (const s of skippedFiles.slice(0, 25)) {
      console.log(`- ${s.filePath} :: ${s.reason}`);
    }
    if (skippedFiles.length > 25) {
      console.log(`...and ${skippedFiles.length - 25} more`);
    }
  }

  console.log("");
  console.log(WRITE
    ? "Done. Revisa con git diff / git status."
    : "Dry-run done. Si te gusta lo que ves, corre con --write para aplicar."
  );
})();
