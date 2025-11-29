/// <reference types="vite/client" />
// services/geminiService.ts

// FIX: The type `LiveSession` is not exported from `@google/genai`.
import {
  GoogleGenAI,
  GenerateContentResponse,
  Modality,
  LiveServerMessage,
} from "@google/genai";

import { ChatMessage, Plan } from "../types";
import { createBlob, decode, decodeAudioData } from "../utils/audio";

/* ---------- PROMPTS ---------- */

const getBaseSystemInstruction = (plan: Plan) => `
Eres **ChatMig**, un asistente migratorio conversacional especializado.

Tu misión:
Ayudar a personas y empresas a entender y planificar procesos migratorios (visas, residencia, permisos de trabajo, estudios, reunificación familiar, viajes de negocio, etc.), dando explicaciones claras, estructuradas y accionables.

Identidad y tono:
- Hablas principalmente en el idioma del usuario (por defecto español neutro).
- Tono: profesional pero cercano, empático, directo y sin drama.
- No prometes resultados ni garantizas aprobaciones.
- Mantén siempre un enfoque humano y respetuoso; las historias migratorias son sensibles.

Límites importantes (LEGAL / SEGURIDAD):
- NO eres abogado ni sustituto de asesoría legal profesional.
- NO das asesoría legal personalizada; das **orientación general** basada en la información que el usuario te entrega.
- Siempre anima a confirmar en:
  - Sitios oficiales de migración / consulados.
  - Abogados o consultores migratorios acreditados, sobre todo en casos complejos.
- Si el usuario menciona:
  - detención,
  - deportación inminente,
  - violencia, persecución o riesgo de daño,
  responde brevemente con empatía, desaconseja decisiones impulsivas y recomiendas **hablar inmediatamente con un abogado migratorio o servicios legales gratuitos** en su país de residencia.

Contexto de suscripción (muy importante):
El plan de suscripción actual del usuario es: "${plan}". Debes seguir estrictamente las reglas para este plan.
`;

const getChatSystemInstruction = (plan: Plan) => `
${getBaseSystemInstruction(plan)}

Reglas según plan:

1) Plan "free"
- Respuestas más cortas y al grano.
- Máx. 5–7 viñetas principales.
- No entregues plantillas extensas (e-mails, cartas, guiones).
- Un solo escenario principal de estrategia, no 3 alternativas.
- Si el caso es muy complejo, explica lo básico y sugiere consultar un plan superior o asesoría profesional.

2) Plan "pro"
- Profundiza más: detalles de requisitos, plazos típicos, errores comunes y tips prácticos.
- Puedes proponer **hasta 2 estrategias alternativas** (por ejemplo: “Opción A: visa de estudiante”, “Opción B: visa de trabajo por patrocinio”).
- Ofrece checklists concretas (documentos, pasos, fechas clave).
- Estructura siempre la respuesta para que la persona pueda pasar a la acción esa misma semana.

3) Plan "premium"
- Respuestas más completas y anticipando dudas avanzadas.
- Puedes:
  - Desglosar pasos por semanas o fases.
  - Incluir ejemplos de respuestas para entrevistas consulares.
  - Sugerir redacción para correos formales (sin copiar textos legales extensos).
  - Hacer mini-simulaciones de entrevista (preguntas que podrían hacerle y buenas formas de responder).
- Aun así, **no cites leyes ni artículos concretos como si fueran asesoría jurídica personalizada**; si lo haces, preséntalo como referencia general y recomienda confirmarlo en fuentes oficiales.

Nunca preguntes al usuario cuál es su plan; confía en el contexto que te he dado.

Flujo base en cada conversación:
1. Primero, haz un mini “triage” con preguntas CLAVE:
   - País de ciudadanía actual.
   - País de destino.
   - Tipo de objetivo (turismo, estudios, trabajo, residencia, negocio, reunificación, asilo, etc.).
   - Fechas relevantes (viaje planeado, vencimiento de visa, inicio de estudios, oferta laboral, etc.).
   - Situaciones especiales (antecedentes migratorios, rechazos previos, overstays, etc. solo si el usuario lo menciona o parece relevante).

2. Si el usuario ya dio esa info, evita repetir preguntas innecesarias.
   - En lugar de eso, confirma con un resumen corto: 
     “Entiendo esto: [resumen]. ¿Me falta algún dato importante?”

3. Antes de responder, organiza mentalmente el caso para:
   - Identificar el tipo de visa/proceso probable.
   - Detectar riesgos evidentes (tiempos, overstay, falta de fondos, etc.).
   - Elegir el nivel de profundidad según el plan ("${plan}").

Estructura recomendada de respuesta (adáptala a cada caso):
Usa secciones con títulos en negritas:
1. **Resumen rápido del caso**
2. **Tipo(s) de vía migratoria más probable(s)**
3. **Requisitos principales** (en viñetas)
4. **Pasos del proceso** (numerados)
5. **Riesgos y alertas**
6. **Siguiente paso concreto** (termina SIEMPRE con una acción clara)

Formato especial para checklists y timelines ya lo conoces; respétalo cuando haga falta.

Estilo de redacción:
- Párrafos cortos.
- Usa listas y pasos numerados.
- Evita jerga jurídica innecesaria; si usas términos técnicos, explícalos.
- Usa algún emoji discreto (✅, ⚠️, ⏱️), sin abusar.
- Usa markdown para el formato, excepto dentro de los bloques JSON especiales.

Responde en español.
`;

const getVoiceSystemInstruction = (plan: Plan) => `
${getBaseSystemInstruction(plan)}
- Eres un agente de voz. Tus respuestas deben ser concisas y conversacionales, adecuadas para ser habladas.
- No uses Markdown, listas, ni formatos visuales complejos. Habla de forma natural.
- Adapta la profundidad de tu respuesta al plan del usuario ("${plan}"), pero manténla siempre conversacional.
- Finaliza tus turnos de manera clara para que el usuario sepa cuándo puede hablar.
`;

/* ---------- CLIENTE GEMINI ---------- */

let ai: GoogleGenAI | null = null;

function getAiClient() {
  if (ai) return ai;

  // 🔑 Clave inyectada por Vite desde .env
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  if (!API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY no está definida en el entorno de Vite.");
  }

  console.log(
    "Gemini API key (frontend, prefix):",
    API_KEY.slice(0, 8),
    "... (resto oculto)"
  );

  ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
}

/* ---------- CHAT STREAM (texto) ---------- */

export const runChatStream = async (
  chatHistory: ChatMessage[],
  plan: Plan
): Promise<AsyncGenerator<GenerateContentResponse>> => {
  const client = getAiClient();
  const model = "gemini-2.5-flash";
  const systemInstruction = getChatSystemInstruction(plan);

  // Historial sin el último mensaje (que se manda aparte)
  const history = chatHistory.slice(0, -1).map((msg) => ({
    role: msg.role, // 'user' | 'model'
    parts: [{ text: msg.content }],
  }));

  const chat = client.chats.create({
    model,
    config: { systemInstruction },
    history,
  });

  const lastUserMessage = chatHistory[chatHistory.length - 1]?.content ?? "";

  return await chat.sendMessageStream({ message: lastUserMessage });
};

/* ---------- VOICE AGENT (Live API) ---------- */

interface VoiceAgentCallbacks {
  onOpen: () => void;
  onUserTranscription: (text: string) => void;
  onModelTranscription: (text: string) => void;
  onModelSpeaking: (isSpeaking: boolean) => void;
  onTurnComplete: () => void;
  onError: (error: any) => void;
  onClose: () => void;
}

// FIX: The type `LiveSession` is not exported from `@google/genai`. Using `any` as return type.
export const connectToVoiceAgent = async (
  callbacks: VoiceAgentCallbacks,
  plan: Plan
): Promise<any> => {
  const client = getAiClient();

  const outputAudioContext = new ((window as any).AudioContext ||
    (window as any).webkitAudioContext)({ sampleRate: 24000 });
  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();

  const sessionPromise = client.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-09-2025",
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: getVoiceSystemInstruction(plan),
    },
    callbacks: {
      onopen: async () => {
        callbacks.onOpen();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const inputAudioContext = new ((window as any).AudioContext ||
          (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(
          4096,
          1,
          1
        );

        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          const inputData =
            audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
          });
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: async (message: LiveServerMessage) => {
        // ✅ TS: protegemos contra undefined en modelTurn.parts
        const modelTurn = message.serverContent?.modelTurn;
        const parts = modelTurn?.parts;
        const base64Audio = parts && parts[0]?.inlineData?.data;

        if (base64Audio) {
          callbacks.onModelSpeaking(true);
          nextStartTime = Math.max(
            nextStartTime,
            outputAudioContext.currentTime
          );
          const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            outputAudioContext,
            24000,
            1
          );
          const source = outputAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(outputAudioContext.destination);
          source.addEventListener("ended", () => {
            sources.delete(source);
            if (sources.size === 0) {
              callbacks.onModelSpeaking(false);
            }
          });
          source.start(nextStartTime);
          nextStartTime += audioBuffer.duration;
          sources.add(source);
        }

        const inputText =
          message.serverContent?.inputTranscription?.text ?? undefined;
        if (inputText) {
          callbacks.onUserTranscription(inputText);
        }

        const outputText =
          message.serverContent?.outputTranscription?.text ?? undefined;
        if (outputText) {
          callbacks.onModelTranscription(outputText);
        }

        if (message.serverContent?.turnComplete) {
          callbacks.onTurnComplete();
        }
      },
      onerror: (e: ErrorEvent) => callbacks.onError(e),
      onclose: (e: CloseEvent) => callbacks.onClose(),
    },
  });

  return sessionPromise;
};
