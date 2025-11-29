// scripts/checkGeminiKey.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai"; // 👈 IMPORT CORRECTO

// Cargador simple de .env
function loadEnv(envPath = ".env") {
  const fullPath = path.resolve(process.cwd(), envPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ No se encontró el archivo ${fullPath}`);
    return;
  }

  const content = fs.readFileSync(fullPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// 1. Cargamos variables del .env
loadEnv();

// 2. Buscamos la clave de Gemini
const rawKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!rawKey) {
  console.error("❌ No se encontró GEMINI_API_KEY ni API_KEY en el .env");
  process.exit(1);
}

const apiKey = rawKey.trim();

console.log(`🔍 Probando GEMINI_API_KEY: ${apiKey.slice(0, 8)}... (resto oculto)`);

// 3. Probamos una llamada real a Gemini Developer API
const ai = new GoogleGenAI({
  apiKey,
  vertexai: false, // 👈 usamos Gemini Developer API (AI Studio), no Vertex
});

async function main() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: "Ping de prueba desde checkGeminiKey" }],
        },
      ],
    });

    const text = response.text;

    console.log("✅ La API key parece VÁLIDA. Gemini respondió esto:");
    console.log("----------------------------------------------");
    console.log(text?.slice(0, 300) || "(respuesta vacía pero válida)");
    console.log("----------------------------------------------");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error al llamar a Gemini con esta clave:");

    console.error(err?.message || err);

    if (err?.status) {
      console.error("Status:", err.status);
    }
    if (err?.error) {
      console.error("Detalles:", JSON.stringify(err.error, null, 2));
    }

    process.exit(1);
  }
}

main();
