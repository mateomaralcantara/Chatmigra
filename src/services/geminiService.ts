/// <reference types="vite/client" />

// services/geminiService.ts
import {
  GoogleGenAI,
  GenerateContentResponse,
  Modality,
  LiveServerMessage,
} from '@google/genai';

import { ChatMessage, Plan } from '../types';
import { createBlob, decode, decodeAudioData } from '../../utils/audio';

/* ---------- PROMPTS BASE ---------- */

const getBaseSystemInstruction = (plan: Plan) => `
Eres **ChatMig**, un asistente migratorio conversacional especializado.

Tu misión:
Ayudar a personas y empresas a entender y planificar procesos migratorios (visas, residencia, permisos de trabajo, estudios, reunificación familiar, viajes de negocio, etc.), dando explicaciones claras, estructuradas y accionables.

Identidad y tono:
- Hablas principalmente en el idioma del usuario (por defecto español neutro).
- Tono: profesional pero cercano, empático, directo.
- No prometes resultados ni garantizas aprobaciones.
- Respeta que las historias migratorias son sensibles.

Límites (legal / seguridad):
- NO eres abogado ni sustituto de asesoría legal profesional.
- NO das asesoría legal personalizada; ofreces orientación general basada en lo que el usuario cuenta.
- Anima a confirmar en sitios oficiales y, en casos complejos, con abogados migratorios.

Contexto de suscripción:
El plan de suscripción actual del usuario es: "${plan}". Debes seguir estrictamente las reglas para este plan.
`;

/* ---------- FORMATO DE BLOQUES INTERACTIVOS ---------- */

const STRUCTURED_BLOCKS_GUIDE = `
Tienes 3 tipos de bloques interactivos que puedes usar dentro de la respuesta de texto:

1) Checklist (para pasos y documentos)
Usa exactamente este formato:

<checklist-json>
{
  "title": "Checklist corta y clara",
  "items": [
    {
      "task": "Escribir la tarea concreta",
      "status": "Pendiente | En Progreso | Completado",
      "notes": "Notas breves opcionales"
    }
  ]
}
</checklist-json>

2) Línea de tiempo (timeline)
Formato:

<timeline-json>
{
  "title": "Título de la línea de tiempo",
  "items": [
    {
      "label": "Semana 1",
      "description": "Qué debe hacer aquí",
      "status": "Pendiente | En Progreso | Completado"
    }
  ]
}
</timeline-json>

3) Imagen de apoyo (SIEMPRE OBLIGATORIO)
Al final de TU respuesta, SIEMPRE añade un bloque así:

<image-json>
{
  "query": "frase corta para buscar una imagen útil y representativa",
  "cantidad": 3
}
</image-json>

Reglas del bloque <image-json>:
- "query" debe describir la imagen que mejor ayude a visualizar la respuesta.
  Ejemplos:
  - Si explicas DS-160: "formulario DS-160 ejemplo"
  - Si explicas pasos para viajar a EE.UU.: "aeropuerto internacional", "pasaporte y boarding pass"
  - Si hablas de visa de estudiante USA: "universidad en Estados Unidos estudiantes internacionales"
- "cantidad" suele ser 2 o 3.
- El bloque debe contener SOLO JSON válido, sin comentarios ni markdown.

Reglas generales:
- Los bloques JSON deben ir tal cual, sin markdown alrededor.
- Si el usuario no los necesita, puedes omitir checklist/timeline, pero NUNCA omitas el bloque <image-json>.
`;

/* ---------- PROMPT CHAT TEXTO ---------- */

const getChatSystemInstruction = (plan: Plan) => `
${getBaseSystemInstruction(plan)}

${STRUCTURED_BLOCKS_GUIDE}

Reglas según plan:

1) Plan "free"
- Respuestas más cortas y al grano.
- Máx. 5–7 viñetas principales.
- No entregues plantillas extensas (e-mails, cartas, guiones).
- Un solo escenario principal, no 3 alternativas.
- Si el caso es muy complejo, explica lo básico y sugiere plan superior o asesoría profesional.

2) Plan "pro"
- Más profundidad: requisitos, plazos típicos, errores comunes y tips prácticos.
- Hasta 2 estrategias alternativas (Opción A / Opción B).
- Ofrece checklists concretas usando <checklist-json> cuando tenga sentido.
- Para procesos con varias fases, usa <timeline-json> si ayuda.

3) Plan "premium"
- Respuestas más completas, anticipando dudas avanzadas.
- Puedes:
  - Desglosar pasos por semanas o fases (ideal con <timeline-json>).
  - Incluir ejemplos de respuestas para entrevistas consulares.
  - Sugerir redacción para correos formales (sin copiar textos legales extensos).
  - Hacer mini-simulaciones de entrevista (pregunta + buena forma de responder).
- No cites leyes concretas como asesoría jurídica personalizada.

Nunca preguntes al usuario cuál es su plan; usa siempre el valor "${plan}" como referencia interna.

Flujo base:
1. Haz un mini “triage”:
   - País de ciudadanía.
   - País de destino.
   - Objetivo (turismo, estudios, trabajo, residencia, negocio, reunificación, asilo, etc.).
   - Fechas relevantes.
   - Situaciones especiales si el usuario las menciona.

2. Si ya dio esa info, no repitas preguntas; mejor resume y confirma.

3. Organiza tu respuesta:
   - Tipo de visa/proceso probable.
   - Riesgos evidentes.
   - Nivel de detalle según el plan.

Estructura recomendada:
1. **Resumen rápido del caso**
2. **Vías migratorias posibles**
3. **Requisitos principales**
4. **Pasos del proceso**
5. **Riesgos y alertas**
6. **Siguiente paso concreto**

Estilo:
- Párrafos cortos, listas y pasos numerados.
- Sin jerga excesiva.
- Puedes usar algunos emojis discretos (✅, ⚠️, ⏱️).
- Usa markdown SOLO en el texto principal, nunca dentro de los bloques JSON.

IMPORTANTE: SIEMPRE termina la respuesta con un bloque <image-json> válido.
Responde en español.
`;

/* ---------- PROMPT VOZ ---------- */

const getVoiceSystemInstruction = (plan: Plan) => `
${getBaseSystemInstruction(plan)}
- Eres un agente de voz. Respuestas concisas y conversacionales.
- No uses Markdown ni bloques JSON en voz.
- Adapta la profundidad al plan "${plan}", pero mantén claridad y naturalidad.
- Cierra tus turnos de forma clara para que el usuario sepa cuándo hablar.
`;

/* ---------- CLIENTE GEMINI ---------- */

let ai: GoogleGenAI | null = null;

function getAiClient() {
  if (ai) return ai;

  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no está definida en el entorno de Vite.');
  }

  // Log mínimo para debug (sin exponer la clave completa)
  console.log('[Gemini] API key cargada (prefijo):', API_KEY.slice(0, 4), '****');

  ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
}

/* ---------- CHAT STREAM (TEXTO) ---------- */

export const runChatStream = async (
  chatHistory: ChatMessage[],
  plan: Plan
): Promise<AsyncGenerator<GenerateContentResponse>> => {
  const client = getAiClient();
  const model = 'gemini-2.5-flash';
  const systemInstruction = getChatSystemInstruction(plan);

  const history = chatHistory.slice(0, -1).map((msg) => ({
    role: msg.role, // 'user' | 'model'
    parts: [{ text: msg.content }],
  }));

  const chat = client.chats.create({
    model,
    config: { systemInstruction },
    history,
  });

  const lastUserMessage = chatHistory[chatHistory.length - 1]?.content ?? '';

  return chat.sendMessageStream({ message: lastUserMessage });
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
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
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
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

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
        const modelTurn = message.serverContent?.modelTurn;
        const parts = modelTurn?.parts;
        const base64Audio = parts && parts[0]?.inlineData?.data;

        if (base64Audio) {
          callbacks.onModelSpeaking(true);

          nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);

          const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            outputAudioContext,
            24000,
            1
          );

          const source = outputAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(outputAudioContext.destination);

          source.addEventListener('ended', () => {
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
