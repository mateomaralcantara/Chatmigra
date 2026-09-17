/* scripts/trace-free-plan.cjs
   Uso:
     node scripts/trace-free-plan.cjs

   Qué hace:
   - Busca la definición de enum Plan (o const enum / union) en tu código.
   - Encuentra usos de Plan.FREE, strings "free", "FREE", y patrones comunes:
     useState(Plan.FREE), defaultPlan = Plan.FREE, localStorage fallback, guards, etc.
   - Imprime archivo, línea, y snippet (contexto).
*/

const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");

if (!tsconfigPath) {
  console.error("No encontré tsconfig.json en la raíz del proyecto.");
  process.exit(1);
}

const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (readResult.error) {
  console.error("Error leyendo tsconfig.json:", readResult.error.messageText);
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(
  readResult.config,
  ts.sys,
  path.dirname(tsconfigPath)
);

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});

function isAppFile(fileName) {
  const n = fileName.replace(/\\/g, "/");
  return (
    n.includes("/src/") &&
    !n.endsWith(".d.ts") &&
    (n.endsWith(".ts") || n.endsWith(".tsx") || n.endsWith(".js") || n.endsWith(".jsx"))
  );
}

function getLineInfo(sf, pos) {
  const lc = sf.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character + 1 };
}

function getSnippet(sf, pos, contextLines = 2) {
  const text = sf.getFullText();
  const { line } = sf.getLineAndCharacterOfPosition(pos);

  const lines = text.split(/\r?\n/);
  const start = Math.max(0, line - contextLines);
  const end = Math.min(lines.length - 1, line + contextLines);

  const out = [];
  for (let i = start; i <= end; i++) {
    const mark = i === line ? ">" : " ";
    out.push(`${mark} ${String(i + 1).padStart(4, " ")} | ${lines[i]}`);
  }
  return out.join("\n");
}

function printHit(kind, sf, nodePos, extra) {
  const { line, col } = getLineInfo(sf, nodePos);
  console.log("—".repeat(90));
  console.log(`[${kind}] ${sf.fileName}:${line}:${col}`);
  if (extra) console.log(extra);
  console.log(getSnippet(sf, nodePos, 2));
}

let enumPlanFound = 0;
let freeRefs = 0;
let stringFreeRefs = 0;
let patternsFound = 0;

const PATTERNS = [
  /useState\s*\(\s*Plan\.FREE\s*\)/,
  /useMemo\s*\(\s*\(\)\s*=>\s*Plan\.FREE/,
  /defaultPlan\s*=\s*Plan\.FREE/,
  /currentPlan\s*=\s*Plan\.FREE/,
  /setPlan\s*\(\s*Plan\.FREE\s*\)/,
  /onPlanChange\s*\(\s*Plan\.FREE\s*\)/,
  /plan\s*===\s*Plan\.FREE/,
  /Plan\.FREE\s*\?/,
  /localStorage\.(getItem|setItem)\(/,
];

function visitSourceFile(sf) {
  // Búsqueda textual rápida (para detectar "free" sin enum)
  const full = sf.getFullText();
  if (/["'`]free["'`]/i.test(full) || /\bFREE\b/.test(full)) {
    // No imprimimos todo; luego AST encontrará posiciones de literales.
  }

  function visit(node) {
    // 1) Detecta enum Plan
    if (ts.isEnumDeclaration(node) && node.name?.text === "Plan") {
      enumPlanFound++;
      const members = node.members.map(m => m.name.getText(sf)).join(", ");
      printHit("DEF enum Plan", sf, node.getStart(sf), `Miembros: ${members}`);
    }

    // 2) Detecta `export type Plan = ...` (union)
    if (ts.isTypeAliasDeclaration(node) && node.name?.text === "Plan") {
      enumPlanFound++;
      printHit("DEF type Plan", sf, node.getStart(sf), `Alias: ${node.type.getText(sf)}`);
    }

    // 3) Detecta `Plan.FREE` por AST
    if (ts.isPropertyAccessExpression(node)) {
      const left = node.expression.getText(sf);
      const right = node.name.getText(sf);
      if (left === "Plan" && right === "FREE") {
        freeRefs++;
        printHit("REF Plan.FREE", sf, node.getStart(sf));
      }
    }

    // 4) Detecta literales "free" / "FREE" (cuando no usan enum)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const v = node.text;
      if (typeof v === "string" && v.toLowerCase() === "free") {
        stringFreeRefs++;
        printHit('REF "free" (string)', sf, node.getStart(sf));
      }
      if (typeof v === "string" && v === "FREE") {
        stringFreeRefs++;
        printHit('REF "FREE" (string)', sf, node.getStart(sf));
      }
    }

    // 5) Detecta patrones típicos (defaults / guards / persistencia)
    if (ts.isCallExpression(node) || ts.isBinaryExpression(node) || ts.isConditionalExpression(node)) {
      const chunk = node.getText(sf);
      for (const re of PATTERNS) {
        if (re.test(chunk)) {
          patternsFound++;
          printHit("PATTERN", sf, node.getStart(sf), `Match: ${re}`);
          break;
        }
      }
    }

    node.forEachChild(visit);
  }

  sf.forEachChild(visit);
}

// Recorre archivos del programa
for (const sf of program.getSourceFiles()) {
  if (!isAppFile(sf.fileName)) continue;
  visitSourceFile(sf);
}

console.log("\n" + "=".repeat(90));
console.log("RESUMEN");
console.log(`Definiciones encontradas de Plan (enum/type): ${enumPlanFound}`);
console.log(`Referencias Plan.FREE: ${freeRefs}`);
console.log(`Referencias string "free"/"FREE": ${stringFreeRefs}`);
console.log(`Patrones (defaults/guards/storage/etc.) detectados: ${patternsFound}`);
console.log("=".repeat(90));

// Si no encontró nada, sugiere dónde mirar
if (enumPlanFound === 0 && freeRefs === 0 && stringFreeRefs === 0) {
  console.log("\nNo encontré nada claro relacionado a Plan FREE.");
  console.log("Siguiente paso recomendado:");
  console.log("- Busca en src/types.ts o src/types/index.ts si Plan está definido fuera de TS (JSON, backend).");
  console.log("- O tu 'Plan' viene desde API y no está modelado en el front.");
}
